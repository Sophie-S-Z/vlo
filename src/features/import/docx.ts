import JSZip from 'jszip';
import { escapeHtml, outline, titleOfFile } from './outline';
import { ImportError, type ImportNode } from './tree';

/*
 * Word files (roadmap F34). Vlo reads word/document.xml with the browser's XML parser: paragraphs, the
 * Heading 1, Heading 2 and Title styles, bold, italic, underline, strike, superscript, subscript, tabs,
 * line breaks and footnotes. Tables and pictures are left out, and the summary says so.
 */

const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';

function children(element: Element, name: string): Element[] {
  return Array.from(element.children).filter((c) => c.namespaceURI === W && c.localName === name);
}

function child(element: Element | undefined, name: string): Element | undefined {
  return element ? children(element, name)[0] : undefined;
}

function attr(element: Element | undefined, name: string): string | null {
  return element?.getAttributeNS(W, name) ?? null;
}

/** A toggle such as <w:b/> is on unless its value says off. */
function on(element: Element | undefined): boolean {
  if (!element) return false;
  const value = attr(element, 'val');
  return value === null || !['0', 'false', 'off', 'none'].includes(value);
}

async function xml(zip: JSZip, path: string): Promise<Document | null> {
  const text = await zip.file(path)?.async('string');
  if (text === undefined) return null;
  const doc = new DOMParser().parseFromString(text, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length > 0) throw new ImportError('The Word file is damaged.');
  return doc;
}

/** The heading level of each paragraph style: 1 for Title and Heading 1, then 2 and 3. */
function headingStyles(styles: Document | null): Map<string, 1 | 2 | 3> {
  const out = new Map<string, 1 | 2 | 3>();
  for (const style of Array.from(styles?.getElementsByTagNameNS(W, 'style') ?? [])) {
    const id = attr(style, 'styleId');
    const name = attr(child(style, 'name'), 'val')?.toLowerCase() ?? '';
    const level =
      name === 'title' || name === 'heading 1'
        ? 1
        : name === 'heading 2'
          ? 2
          : name === 'heading 3'
            ? 3
            : null;
    if (id && level) out.set(id, level);
  }
  return out;
}

interface Context {
  notes: Map<string, string>;
  skipped: Map<string, number>;
}

function skip(ctx: Context, what: string) {
  ctx.skipped.set(what, (ctx.skipped.get(what) ?? 0) + 1);
}

function runHtml(run: Element, ctx: Context): string {
  const props = child(run, 'rPr');
  let text = '';
  for (const part of Array.from(run.children)) {
    if (part.namespaceURI !== W) continue;
    if (part.localName === 't') text += escapeHtml(part.textContent);
    else if (part.localName === 'tab') text += '\t';
    else if (part.localName === 'br' || part.localName === 'cr') text += '<br>';
    else if (part.localName === 'drawing' || part.localName === 'pict') skip(ctx, 'picture');
    else if (part.localName === 'footnoteReference') {
      const note = ctx.notes.get(attr(part, 'id') ?? '') ?? '';
      text += `<sup data-footnote="" data-note="${escapeHtml(JSON.stringify(note))}"></sup>`;
    }
  }
  if (text === '') return '';
  const align = attr(child(props, 'vertAlign'), 'val');
  if (align === 'superscript') text = `<sup>${text}</sup>`;
  if (align === 'subscript') text = `<sub>${text}</sub>`;
  if (on(child(props, 'strike'))) text = `<s>${text}</s>`;
  if (on(child(props, 'u'))) text = `<u>${text}</u>`;
  if (on(child(props, 'i'))) text = `<em>${text}</em>`;
  if (on(child(props, 'b'))) text = `<strong>${text}</strong>`;
  return text;
}

/** The runs of a paragraph, with the runs inside links and tracked insertions. */
function paragraphHtml(paragraph: Element, ctx: Context): string {
  let out = '';
  for (const part of Array.from(paragraph.children)) {
    if (part.namespaceURI !== W) continue;
    if (part.localName === 'r') out += runHtml(part, ctx);
    else if (part.localName === 'hyperlink' || part.localName === 'ins' || part.localName === 'smartTag')
      out += paragraphHtml(part, ctx);
  }
  return out;
}

/** The plain text of each footnote, by its id. */
function footnotes(doc: Document | null): Map<string, string> {
  const out = new Map<string, string>();
  for (const note of Array.from(doc?.getElementsByTagNameNS(W, 'footnote') ?? [])) {
    const id = attr(note, 'id');
    const text = Array.from(note.getElementsByTagNameNS(W, 't'))
      .map((t) => t.textContent)
      .join('')
      .trim();
    if (id && text) out.set(id, text);
  }
  return out;
}

export async function readDocx(
  name: string,
  bytes: Uint8Array,
): Promise<{ nodes: ImportNode[]; skipped: string[] }> {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(bytes);
  } catch {
    throw new ImportError('This file is not a Word file. Save it as .docx in Word, then import it.');
  }
  const doc = await xml(zip, 'word/document.xml');
  const body = doc?.getElementsByTagNameNS(W, 'body')[0];
  if (!body) throw new ImportError('This file is not a Word file. Save it as .docx in Word, then import it.');
  const styles = headingStyles(await xml(zip, 'word/styles.xml'));
  const ctx: Context = { notes: footnotes(await xml(zip, 'word/footnotes.xml')), skipped: new Map() };

  let html = '';
  for (const part of Array.from(body.children)) {
    if (part.namespaceURI !== W) continue;
    if (part.localName === 'tbl') skip(ctx, 'table');
    if (part.localName !== 'p') continue;
    const level = styles.get(attr(child(child(part, 'pPr'), 'pStyle'), 'val') ?? '');
    const tag = level === 1 ? 'h1' : level === 2 ? 'h2' : level === 3 ? 'h3' : 'p';
    html += `<${tag}>${paragraphHtml(part, ctx)}</${tag}>`;
  }
  const skipped = [...ctx.skipped].map(([what, n]) => (n === 1 ? `1 ${what}` : `${String(n)} ${what}s`));
  return { nodes: outline(titleOfFile(name), html, '\n'), skipped };
}
