import JSZip from 'jszip';
import { count, skippedList, type Skipped } from './html';
import { escapeHtml, outline, titleOfFile } from './outline';
import { ImportError, type ImportNode } from './tree';

/*
 * OpenDocument text files (.odt) from LibreOffice, OpenOffice and Google Docs (roadmap F34). Vlo reads
 * content.xml: headings by their outline level, paragraphs, lists, line breaks, tabs, runs of spaces,
 * bold, italic, underline, strike, superscript, subscript and footnotes. Tables, pictures and other
 * objects stay out, and the summary counts them. Comments, deleted text and tables of contents stay out.
 */

const TEXT = 'urn:oasis:names:tc:opendocument:xmlns:text:1.0';
const STYLE = 'urn:oasis:names:tc:opendocument:xmlns:style:1.0';
const FO = 'urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0';

const NOT_ODT = 'This file is not an OpenDocument text file. Save it as .odt, then import it.';

interface Marks {
  bold: boolean;
  italic: boolean;
  underline: boolean;
  strike: boolean;
  script: 'sup' | 'sub' | null;
}

const PLAIN: Marks = { bold: false, italic: false, underline: false, strike: false, script: null };

/**
 * The marks that each text and paragraph style sets, with the marks of its parent style. A mark that a style
 * does not set comes from the text around it, so a span that only sets italic keeps the bold of its paragraph.
 */
function styleMarks(docs: readonly Document[]): Map<string, Partial<Marks>> {
  const styles = docs.flatMap((doc) => Array.from(doc.getElementsByTagNameNS(STYLE, 'style')));
  const byName = new Map(styles.map((s) => [s.getAttributeNS(STYLE, 'name') ?? '', s]));
  const out = new Map<string, Partial<Marks>>();
  const marksOf = (name: string, depth = 0): Partial<Marks> => {
    const known = out.get(name);
    if (known) return known;
    const style = byName.get(name);
    if (!style || depth > 20) return {};
    const parent = style.getAttributeNS(STYLE, 'parent-style-name');
    const marks = { ...(parent ? marksOf(parent, depth + 1) : {}) };
    const props = style.getElementsByTagNameNS(STYLE, 'text-properties')[0];
    if (props) {
      const weight = props.getAttributeNS(FO, 'font-weight');
      if (weight) marks.bold = weight === 'bold' || Number(weight) >= 600;
      const fontStyle = props.getAttributeNS(FO, 'font-style');
      if (fontStyle) marks.italic = fontStyle === 'italic' || fontStyle === 'oblique';
      const underline = props.getAttributeNS(STYLE, 'text-underline-style');
      if (underline) marks.underline = underline !== 'none';
      const strike = props.getAttributeNS(STYLE, 'text-line-through-style');
      if (strike) marks.strike = strike !== 'none';
      const position = props.getAttributeNS(STYLE, 'text-position');
      if (position) {
        const word = position.split(' ')[0] ?? '';
        marks.script =
          word === 'super' || parseFloat(word) > 0
            ? 'sup'
            : word === 'sub' || parseFloat(word) < 0
              ? 'sub'
              : null;
      }
    }
    out.set(name, marks);
    return marks;
  };
  for (const name of byName.keys()) marksOf(name);
  return out;
}

/** The names of the list styles whose first level has numbers. */
function numberedLists(docs: readonly Document[]): Set<string> {
  const out = new Set<string>();
  for (const doc of docs)
    for (const style of Array.from(doc.getElementsByTagNameNS(TEXT, 'list-style'))) {
      const first = Array.from(style.children).find((c) => c.getAttributeNS(TEXT, 'level') === '1');
      if (first?.localName === 'list-level-style-number') out.add(style.getAttributeNS(STYLE, 'name') ?? '');
    }
  return out;
}

interface Context {
  marks: ReadonlyMap<string, Partial<Marks>>;
  numbered: ReadonlySet<string>;
  skipped: Skipped;
}

const styleOf = (element: Element) => element.getAttributeNS(TEXT, 'style-name') ?? '';

function marked(text: string, marks: Marks): string {
  let out = text;
  if (out === '') return out;
  if (marks.script) out = `<${marks.script}>${out}</${marks.script}>`;
  if (marks.strike) out = `<s>${out}</s>`;
  if (marks.underline) out = `<u>${out}</u>`;
  if (marks.italic) out = `<em>${out}</em>`;
  if (marks.bold) out = `<strong>${out}</strong>`;
  return out;
}

/** The HTML of the text inside a paragraph or a span. */
function inline(parent: Element, marks: Marks, ctx: Context): string {
  let out = '';
  for (const node of Array.from(parent.childNodes)) {
    if (node.nodeType === Node.TEXT_NODE) {
      out += marked(escapeHtml(node.textContent ?? ''), marks);
      continue;
    }
    if (!(node instanceof Element)) continue;
    if (node.namespaceURI !== TEXT) {
      if (node.localName === 'frame')
        count(ctx.skipped, node.getElementsByTagNameNS('*', 'image').length > 0 ? 'picture' : 'object');
      continue;
    }
    switch (node.localName) {
      case 'span':
        out += inline(node, { ...marks, ...ctx.marks.get(styleOf(node)) }, ctx);
        break;
      case 's':
        out += ' '.repeat(Number(node.getAttributeNS(TEXT, 'c') ?? '1') || 1);
        break;
      case 'tab':
        out += '\t';
        break;
      case 'line-break':
        out += '<br>';
        break;
      case 'note': {
        const body = node.getElementsByTagNameNS(TEXT, 'note-body')[0];
        const note = (body?.textContent ?? '').trim();
        out += `<sup data-footnote="" data-note="${escapeHtml(JSON.stringify(note))}"></sup>`;
        break;
      }
      // Links, fields such as a date, and other wrappers keep their text.
      default:
        out += inline(node, marks, ctx);
    }
  }
  return out;
}

/** The blocks of the body, a section or a list item. */
function blocks(parent: Element, ctx: Context): string {
  let out = '';
  for (const node of Array.from(parent.children)) {
    if (node.namespaceURI !== TEXT) {
      if (node.localName === 'table') count(ctx.skipped, 'table');
      continue;
    }
    if (node.localName === 'h') {
      const level = Math.min(Number(node.getAttributeNS(TEXT, 'outline-level') ?? '1') || 1, 3);
      out += `<h${String(level)}>${inline(node, PLAIN, ctx)}</h${String(level)}>`;
    } else if (node.localName === 'p') {
      out += `<p>${inline(node, { ...PLAIN, ...ctx.marks.get(styleOf(node)) }, ctx)}</p>`;
    } else if (node.localName === 'list') {
      const items = Array.from(node.children)
        .filter((item) => item.localName === 'list-item' || item.localName === 'list-header')
        .map((item) => `<li>${blocks(item, ctx)}</li>`)
        .join('');
      const tag = ctx.numbered.has(styleOf(node)) ? 'ol' : 'ul';
      out += `<${tag}>${items}</${tag}>`;
    } else if (node.localName === 'section') out += blocks(node, ctx);
  }
  return out;
}

export async function readOdt(
  name: string,
  bytes: Uint8Array,
): Promise<{ nodes: ImportNode[]; skipped: string[] }> {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(bytes);
  } catch {
    throw new ImportError(NOT_ODT);
  }
  const parse = async (path: string) => {
    const text = await zip.file(path)?.async('string');
    if (text === undefined) return null;
    const doc = new DOMParser().parseFromString(text, 'application/xml');
    if (doc.getElementsByTagName('parsererror').length > 0) throw new ImportError(NOT_ODT);
    return doc;
  };
  const content = await parse('content.xml');
  const body = content?.getElementsByTagNameNS('urn:oasis:names:tc:opendocument:xmlns:office:1.0', 'text')[0];
  if (!content || !body) throw new ImportError(NOT_ODT);
  const styles = await parse('styles.xml');
  const docs = styles ? [styles, content] : [content];
  const ctx: Context = { marks: styleMarks(docs), numbered: numberedLists(docs), skipped: new Map() };
  return { nodes: outline(titleOfFile(name), blocks(body, ctx), '\n'), skipped: skippedList(ctx.skipped) };
}
