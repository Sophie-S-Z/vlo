import { parseNote } from './notes';

/*
 * Clean paste (Phase 19, Task B2). A paste from Google Docs, Word, a web page or a PDF keeps bold, italic,
 * underline, strikethrough, superscript and subscript, links, headings, lists, quotes and footnotes. It
 * drops fonts, sizes, colors, backgrounds, classes and empty spans, so the paste takes the look of the
 * project. With `look`, the paste keeps its fonts, sizes and colors, and the rest is the same.
 */

/** The style properties that carry the formats a clean paste keeps, and the alignment. */
const KEPT_STYLES = [
  'font-weight',
  'font-style',
  'text-decoration',
  'text-decoration-line',
  'vertical-align',
  'text-align',
] as const;
/** Attributes of old HTML that set a font, a size or a color. */
const LOOK_ATTRIBUTES = ['color', 'face', 'size', 'bgcolor', 'background'] as const;
/** The span styles that the original look keeps: the ones that Vlo's text styles can show. */
const LOOK_STYLES = ['color', 'font-size'] as const;
const WORD_LIST = /mso-list:\s*l\d/i;
const WORD_LIST_MARKER = /mso-list:\s*ignore/i;
const NUMBERED = /^\s*[\da-z]{1,4}[.)]/i;

function rename(element: Element, tag: string): void {
  const next = element.ownerDocument.createElement(tag);
  for (const { name, value } of Array.from(element.attributes)) next.setAttribute(name, value);
  next.append(...Array.from(element.childNodes));
  element.replaceWith(next);
}

/**
 * Google Docs and Word footnotes: a reference links to its note, and the note links back. Each pair
 * becomes a Vlo footnote, and the list of notes at the end of the paste goes.
 */
function footnotes(body: HTMLElement): void {
  const anchors = Array.from(body.querySelectorAll('a[href^="#"]'));
  const byName = new Map<string, Element>();
  for (const a of anchors) {
    if (a.id) byName.set(a.id, a);
    const name = a.getAttribute('name');
    if (name) byName.set(name, a);
  }
  const target = (a: Element) => byName.get(a.getAttribute('href')?.slice(1) ?? '');
  const emptied: Element[] = [];
  for (const ref of anchors) {
    const note = target(ref);
    if (!ref.isConnected || !note || note === ref || target(note) !== ref) continue;
    // The reference comes first in the text, and its note comes after.
    if (!(ref.compareDocumentPosition(note) & Node.DOCUMENT_POSITION_FOLLOWING)) continue;
    const box = note.closest('p, li') ?? note.parentElement;
    if (!box) continue;
    note.remove();
    const sup = body.ownerDocument.createElement('sup');
    sup.setAttribute('data-footnote', '');
    sup.setAttribute('data-note', JSON.stringify(parseNote(box.textContent.trim())));
    (ref.closest('sup') ?? ref).replaceWith(sup);
    if (box.parentElement) emptied.push(box.parentElement);
    box.remove();
  }
  if (emptied.length === 0) return;
  // The boxes that held the notes, and the rule above them, are empty now.
  for (let box of emptied) {
    while (box !== body && box.isConnected && box.textContent.trim() === '' && !box.querySelector('img')) {
      const parent = box.parentElement;
      box.remove();
      if (!parent) break;
      box = parent;
    }
  }
  for (let last = body.lastElementChild; last?.matches('hr, br'); last = body.lastElementChild) last.remove();
}

/** Word writes each list item as a paragraph with an `mso-list` style. They become lists again. */
function wordLists(body: HTMLElement): void {
  let list = null as Element | null;
  for (const p of Array.from(body.querySelectorAll('p'))) {
    if (!WORD_LIST.test(p.getAttribute('style') ?? '')) continue;
    const marker = Array.from(p.querySelectorAll('span')).find((s) =>
      WORD_LIST_MARKER.test(s.getAttribute('style') ?? ''),
    );
    const tag = NUMBERED.test(marker?.textContent ?? '') ? 'OL' : 'UL';
    marker?.remove();
    if (list?.tagName !== tag || list.nextElementSibling !== p) {
      list = body.ownerDocument.createElement(tag);
      p.before(list);
    }
    const item = body.ownerDocument.createElement('li');
    list.append(item);
    item.append(p);
  }
}

/** The tags that stand for the formats that apps write as span styles, such as Google Docs. */
const SPAN_FORMATS: readonly (readonly [string, (style: CSSStyleDeclaration) => boolean])[] = [
  ['strong', (style) => /^(bold(er)?|[6-9]00)$/.test(style.fontWeight)],
  ['em', (style) => style.fontStyle === 'italic'],
  ['u', (style) => `${style.textDecoration} ${style.textDecorationLine}`.includes('underline')],
  ['s', (style) => `${style.textDecoration} ${style.textDecorationLine}`.includes('line-through')],
  ['sup', (style) => style.verticalAlign === 'super'],
  ['sub', (style) => style.verticalAlign === 'sub'],
];

/**
 * Takes the fonts, sizes and colors off an element. A span becomes the tags of its formats, because any
 * span with a style becomes a text style, which is empty when the style holds formats only. Other
 * elements keep `KEPT_STYLES`. With `look`, a span keeps `LOOK_STYLES` and other elements keep every style.
 */
function plain(element: Element, look: boolean): void {
  element.removeAttribute('class');
  if (!look) for (const name of LOOK_ATTRIBUTES) element.removeAttribute(name);
  if (!(element instanceof HTMLElement) || !element.hasAttribute('style')) return;
  // A link shows its own underline, so the underline that an app draws on it would add a second mark.
  const linked = element.closest('a') !== null;
  const keep = (names: readonly string[]) => {
    const kept = names
      .map((name) => [name, element.style.getPropertyValue(name)] as const)
      .filter(([name, value]) => value !== '' && !(linked && name.startsWith('text-decoration')));
    element.removeAttribute('style');
    for (const [name, value] of kept) element.style.setProperty(name, value);
  };
  if (!element.matches('span, font')) {
    if (!look) keep(KEPT_STYLES);
    return;
  }
  let inner: Element = element;
  for (const [tag, on] of SPAN_FORMATS) {
    if (!on(element.style) || (linked && tag === 'u')) continue;
    const format = element.ownerDocument.createElement(tag);
    format.append(...Array.from(inner.childNodes));
    inner.append(format);
    inner = format;
  }
  keep(look ? LOOK_STYLES : []);
}

/** True when the HTML is a copy from a ProseMirror editor, such as Vlo itself, which keeps all of it. */
export function isEditorCopy(html: string): boolean {
  return html.includes('data-pm-slice');
}

/** The pasted HTML, cleaned. */
export function cleanPastedHtml(html: string, { look = false } = {}): string {
  const page = new DOMParser().parseFromString(html, 'text/html');
  const { body } = page;
  for (const junk of Array.from(body.querySelectorAll('style, script, meta, link, title, o\\:p')))
    junk.remove();
  footnotes(body);
  wordLists(body);
  // Vlo has Heading 2 to Heading 4 in the text, under the item title.
  for (const heading of Array.from(body.querySelectorAll('h1, h5, h6'))) {
    rename(heading, heading.tagName === 'H1' ? 'h2' : 'h4');
  }
  for (const element of Array.from(body.querySelectorAll('*'))) plain(element, look);
  // A span or a font with no attributes left adds nothing.
  for (const box of Array.from(body.querySelectorAll('span, font')).reverse()) {
    if (box.attributes.length === 0) box.replaceWith(...Array.from(box.childNodes));
  }
  return body.innerHTML;
}
