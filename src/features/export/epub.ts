import JSZip from 'jszip';
import { textDirection } from '@/lib/language';
import { gradientCss, type TextFill } from '@/features/editor/format/fill';
import { fontLabel, localFontName, vloFont } from '@/features/editor/format/fonts';
import type { NoteContent } from '@/features/editor/format/notes';
import { mathmlFor, type LatexToMathml } from './latex';
import { parseMathml, type MathNode } from './mathml';
import { isNumbered } from '@/features/book/book';
import type { BookSettings } from '@/lib/db';
import {
  repeatsTitle,
  runsText,
  textBlocks,
  type Block,
  type ExportDoc,
  type Run,
  type RunStyle,
} from './model';
import { fontPaths, PDF_FONTS, type FontStyle, type LoadFile } from './pdf/fonts';

/*
 * EPUB 3 export (spec section 9). The `mimetype` file comes first and is stored without compression. Each
 * chapter is one XHTML file. Poem lines keep their spaces with `white-space: pre-wrap`, and their leading
 * spaces become no-break spaces, so a reader never drops them. Footnotes are EPUB footnote asides, each
 * equation is MathML, and the fonts the text uses travel in the file.
 *
 * Book layout (F51, plan Task J6) adds the front and back matter as their own files, each with its
 * `epub:type`, the contents page in the reading order, chapter numbers and the chapter and scene break
 * styles. The Book screen shows the same XHTML and CSS as its e-reader and phone previews.
 */

export interface EpubOptions {
  loadFile: LoadFile;
  /** The writer's own fonts that may be embedded, by stored value. */
  own?: ReadonlyMap<string, Uint8Array>;
  /** The Vlo font for each own font that cannot be embedded, by stored value. */
  swaps?: ReadonlyMap<string, string>;
  toMathml?: LatexToMathml;
  /** The book's identifier. A new random one by default. */
  id?: string;
  /** The time the file is made. Now by default. */
  modified?: Date;
}

export interface EpubResult {
  bytes: Uint8Array;
  /** Each font and style that has no file, so e-readers draw it from the upright letters. */
  drawnStyles: { font: string; style: 'bold' | 'italic' }[];
}

const XHTML_NS = 'http://www.w3.org/1999/xhtml';
const EPUB_NS = 'http://www.idpf.org/2007/ops';
const MATHML_NS = 'http://www.w3.org/1998/Math/MathML';
const NBSP = '\u00a0';

/** Escapes text for XML. Characters that XML 1.0 forbids are left out. */
export function xmlText(text: string): string {
  return (
    text
      // eslint-disable-next-line no-control-regex -- XML 1.0 has no place for these control characters.
      .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffe\uffff]/g, '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
  );
}

/** A font as it is used: its stored value, resolved for swaps, and its style. */
interface FaceUse {
  font: string;
  bold: boolean;
  italic: boolean;
}

/** The parts of the book that each XHTML file adds to. */
class Book {
  readonly faces = new Map<string, FaceUse>();
  readonly fills = new Map<string, { id: number; fill: TextFill }>();
  constructor(
    readonly doc: ExportDoc,
    readonly toMathml: LatexToMathml,
    private readonly own: ReadonlyMap<string, Uint8Array>,
    private readonly swaps: ReadonlyMap<string, string>,
  ) {}

  /** The font that draws a stored value: a Vlo font, an own font that may be embedded, or a stand-in. */
  resolve(value: string | undefined): string {
    const v = value ?? this.doc.font;
    if (PDF_FONTS[v]) return v;
    if (localFontName(v) !== null) return this.own.has(v) ? v : (this.swaps.get(v) ?? 'newsreader');
    return 'newsreader';
  }

  use(value: string | undefined, bold: boolean, italic: boolean): string {
    const font = this.resolve(value);
    this.faces.set(`${font}|${String(bold)}|${String(italic)}`, { font, bold, italic });
    return font;
  }

  fillClass(fill: TextFill): string {
    const key = JSON.stringify(fill);
    let entry = this.fills.get(key);
    if (!entry) {
      entry = { id: this.fills.size + 1, fill };
      this.fills.set(key, entry);
    }
    return `fill-${String(entry.id)}`;
  }
}

/** The CSS family name of a font in the book. */
function familyOf(font: string): string {
  return `Vlo ${(vloFont(font)?.label ?? localFontName(font) ?? font).replace(/['"\\]/g, '')}`;
}

function cssFamily(font: string): string {
  const fallback = vloFont(font)?.fallback ?? 'serif';
  return `'${familyOf(font)}', ${fallback}`;
}

/** Serializes a MathML tree as XHTML-safe MathML. Every character reference becomes a plain character. */
function mathXml(node: MathNode): string {
  const attrs = Object.entries(node.attrs)
    .filter(([name]) => /^[a-zA-Z][\w-]*$/.test(name) && name !== 'xmlns')
    .map(([name, value]) => ` ${name}="${xmlText(value)}"`)
    .join('');
  const inner = node.children.length > 0 ? node.children.map(mathXml).join('') : xmlText(node.text);
  return `<${node.tag}${attrs}>${inner}</${node.tag}>`;
}

function equation(book: Book, latex: string, display: boolean): string {
  const root = parseMathml(book.toMathml(latex));
  if (root.children.length === 0) {
    // MathLive cannot read every command. The LaTeX source stays readable.
    return `<code class="latex">${xmlText(display ? `$$${latex}$$` : `$${latex}$`)}</code>`;
  }
  const body = root.children.map(mathXml).join('');
  return `<math xmlns="${MATHML_NS}" display="${display ? 'block' : 'inline'}" alttext="${xmlText(latex)}">${body}</math>`;
}

function runStyle(book: Book, style: RunStyle, base: { bold: boolean; italic: boolean }): string[] {
  const css: string[] = [];
  const bold = base.bold || style.bold === true;
  const italic = base.italic || style.italic === true;
  if (style.font) css.push(`font-family: ${cssFamily(book.use(style.font, bold, italic))}`);
  else book.use(undefined, bold, italic);
  if (style.color && !style.fill) css.push(`color: ${style.color}`);
  if (style.size !== undefined) css.push(`font-size: ${String(style.size)}em`);
  const lines = [style.underline ? 'underline' : '', style.strike ? 'line-through' : ''].filter(
    (l) => l !== '',
  );
  if (lines.length > 0) css.push(`text-decoration: ${lines.join(' ')}`);
  return css;
}

interface Context {
  /** The notes of the current file, to write as asides at its end. */
  notes: { number: number; note: NoteContent }[];
  /** Poem lines: leading spaces become no-break spaces. */
  poem: boolean;
  bold: boolean;
  italic: boolean;
}

function noteText(book: Book, note: NoteContent): string {
  return note
    .map((run) => {
      const marks = new Set(run.marks?.map((m) => m.type));
      book.use(undefined, marks.has('bold'), marks.has('italic'));
      let html = xmlText(run.text);
      if (marks.has('superscript')) html = `<sup>${html}</sup>`;
      if (marks.has('subscript')) html = `<sub>${html}</sub>`;
      if (marks.has('strike')) html = `<s>${html}</s>`;
      if (marks.has('underline')) html = `<u>${html}</u>`;
      if (marks.has('italic')) html = `<em>${html}</em>`;
      if (marks.has('bold')) html = `<strong>${html}</strong>`;
      return html;
    })
    .join('');
}

function inline(book: Book, runs: readonly Run[], ctx: Context): string {
  let out = '';
  let lineStart = true;
  for (const run of runs) {
    if (run.type === 'break') {
      out += '<br/>';
      lineStart = true;
      continue;
    }
    if (run.type === 'math') {
      out += equation(book, run.latex, false);
      lineStart = false;
      continue;
    }
    if (run.type === 'footnote') {
      ctx.notes.push({ number: run.number, note: run.note });
      const n = String(run.number);
      out += `<a class="noteref" epub:type="noteref" role="doc-noteref" id="ref-${n}" href="#note-${n}">${n}</a>`;
      lineStart = false;
      continue;
    }
    let text = run.text;
    if (ctx.poem && lineStart) {
      // Leading spaces of a poem line, and of each line after a hard break, become no-break spaces.
      text = text.replace(/^ +/, (spaces) => NBSP.repeat(spaces.length));
    }
    if (text !== '') lineStart = false;
    const style = run.style;
    let html = xmlText(text);
    if (style.superscript) html = `<sup>${html}</sup>`;
    if (style.subscript) html = `<sub>${html}</sub>`;
    if (style.italic) html = `<em>${html}</em>`;
    if (style.bold) html = `<strong>${html}</strong>`;
    const css = runStyle(book, style, ctx);
    const classes: string[] = [];
    if (style.fill) classes.push('fill', book.fillClass(style.fill));
    if (css.length > 0 || classes.length > 0) {
      const cls = classes.length > 0 ? ` class="${classes.join(' ')}"` : '';
      const st = css.length > 0 ? ` style="${xmlText(css.join('; '))}"` : '';
      html = `<span${cls}${st}>${html}</span>`;
    }
    if (style.highlight) html = `<mark style="background-color: ${style.highlight}">${html}</mark>`;
    if (style.link) html = `<a href="${xmlText(style.link)}">${html}</a>`;
    out += html;
  }
  return out;
}

function alignStyle(align: string | undefined, extra: string[] = []): string {
  const css = [...(align ? [`text-align: ${align}`] : []), ...extra];
  return css.length > 0 ? ` style="${css.join('; ')}"` : '';
}

/** The first letter of a paragraph with a drop cap, in a span that floats over three lines. */
function withDropCap(book: Book, runs: readonly Run[], ctx: Context): string | null {
  const [first, ...rest] = runs;
  if (first?.type !== 'text' || /^\s/.test(first.text)) return null;
  const letter = [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(first.text)][0]
    ?.segment;
  if (!letter) return null;
  const tail = first.text.slice(letter.length);
  const cap = inline(book, [{ ...first, text: letter }], ctx);
  const others = inline(book, tail === '' ? rest : [{ ...first, text: tail }, ...rest], ctx);
  return `<span class="drop-cap">${cap}</span>${others}`;
}

function blockHtml(book: Book, block: Block, ctx: Context): string {
  switch (block.type) {
    case 'paragraph': {
      const extra: string[] = [];
      if (block.lineSpacing !== undefined)
        extra.push(`line-height: ${String(Math.round(block.lineSpacing * 115) / 100)}`);
      const drop = block.dropCap ? withDropCap(book, block.runs, ctx) : null;
      // A drop cap takes the place of the first-line indent.
      const classes = [drop ? 'has-drop-cap' : block.firstLineIndent ? 'indent' : ''].filter((c) => c !== '');
      const cls = classes.length > 0 ? ` class="${classes.join(' ')}"` : '';
      const body = drop ?? inline(book, block.runs, ctx);
      return `<p${cls}${alignStyle(block.align, extra)}>${body === '' ? '<br/>' : body}</p>`;
    }
    case 'heading': {
      const tag = `h${String(block.level)}`;
      const body = inline(book, block.runs, { ...ctx, bold: true });
      return `<${tag}${alignStyle(block.align)}>${body}</${tag}>`;
    }
    case 'sceneBreak': {
      const kind = book.doc.book?.sceneBreak;
      const mark =
        kind === 'stars' ? '*\u2003*\u2003*' : kind === 'fleuron' ? '\u2766' : kind === 'space' ? NBSP : '#';
      return `<p class="scene-break" role="separator">${mark}</p>`;
    }
    case 'math':
      return `<div class="equation">${equation(book, block.latex, true)}</div>`;
    case 'quote':
      return `<blockquote>${blocksHtml(book, block.blocks, ctx)}</blockquote>`;
    case 'list': {
      const tag = block.ordered ? 'ol' : 'ul';
      const start = block.ordered && block.start !== 1 ? ` start="${String(block.start)}"` : '';
      const items = block.items.map((item) => `<li>${blocksHtml(book, item, ctx)}</li>`).join('');
      return `<${tag}${start}>${items}</${tag}>`;
    }
    case 'stanza': {
      // The hanging indent is on the side where a line starts, so right-to-left poems keep it too.
      const side = textDirection(book.doc.language) === 'rtl' ? 'right' : 'left';
      const lines = block.lines.map((line) => {
        const hanging =
          line.hanging > 0
            ? ` style="padding-${side}: ${String(line.hanging)}em; text-indent: -${String(line.hanging)}em"`
            : '';
        const body = inline(book, line.runs, { ...ctx, poem: true });
        return `<p class="line"${hanging}>${body === '' ? NBSP : body}</p>`;
      });
      return `<div class="stanza">${lines.join('')}</div>`;
    }
  }
}

function blocksHtml(book: Book, blocks: readonly Block[], ctx: Context): string {
  return blocks.map((block) => blockHtml(book, block, ctx)).join('\n');
}

/** The language attributes of each page's html element. */
function htmlLanguage(language: string): string {
  const lang = xmlText(language);
  return `xml:lang="${lang}" lang="${lang}" dir="${textDirection(language)}"`;
}

function page(title: string, body: string, math: boolean, language: string, type?: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="${XHTML_NS}" xmlns:epub="${EPUB_NS}" ${htmlLanguage(language)}>
<head>
<meta charset="UTF-8"/>
<title>${xmlText(title)}</title>
<link rel="stylesheet" type="text/css" href="../styles.css"/>
</head>
<body${math ? ' class="has-math"' : ''}${type ? ` epub:type="${type}"` : ''}>
${body}
</body>
</html>
`;
}

interface Chapter {
  file: string;
  title: string;
  body: string;
  math: boolean;
  /** The `epub:type` of the file's body, in a book. */
  type?: string;
  /** Table of contents entries: the anchor and the title of each titled section in the file. */
  toc: { id: string; title: string; level: number }[];
}

/** Groups sections into files: a new file at each part or chapter title, or at each item in a flat export. */
function chapters(book: Book): Chapter[] {
  const { doc } = book;
  const settings = doc.book;
  const hasFolders = doc.sections.some((s) => s.form === null);
  const out: Chapter[] = [];
  let numbered = 0;
  // True from a chapter title to the first text after it, for the drop cap of a book.
  let opening = false;
  let current: Chapter | null = null;
  let notes: { number: number; note: NoteContent }[] = [];
  const close = () => {
    if (!current) return;
    if (notes.length > 0) {
      current.body += `\n<section class="notes" epub:type="footnotes" role="doc-endnotes">${notes
        .map(({ number, note }) => {
          const n = String(number);
          return `<aside epub:type="footnote" role="doc-footnote" id="note-${n}"><p><a class="note-back" href="#ref-${n}">${n}</a> ${noteText(book, note)}</p></aside>`;
        })
        .join('\n')}</section>`;
    }
    out.push(current);
    current = null;
    notes = [];
  };
  doc.sections.forEach((section, index) => {
    const startsFile = !current || (hasFolders ? section.form === null : true);
    if (startsFile) {
      close();
      current = {
        file: `text/part-${String(out.length + 1)}.xhtml`,
        title: section.title,
        body: '',
        math: false,
        toc: [],
        ...(settings ? { type: 'bodymatter' } : {}),
      };
    }
    const file = current;
    if (!file) return;
    const sectionId = `s${String(index + 1)}`;
    let blocks = section.blocks.filter((block) => !repeatsTitle(doc, section, block));
    let number = '';
    if (settings && section.form === null) {
      const title = blocks[0];
      opening = title?.type === 'heading' && title.level === 2;
      if (opening && isNumbered(section.title.trim())) {
        numbered += 1;
        number = `<p class="chapter-number">${String(numbered)}</p>\n`;
      }
    } else if (settings && opening) {
      opening = false;
      const [first, ...rest] = blocks;
      if (settings.dropCaps && first?.type === 'paragraph') blocks = [{ ...first, dropCap: true }, ...rest];
    }
    const heading = blocks.find((b) => b.type === 'heading');
    if (heading?.type === 'heading') {
      file.toc.push({
        id: sectionId,
        title: runsText(heading.runs).trim() || section.title,
        level: heading.level,
      });
    }
    const ctx: Context = { notes, poem: false, bold: false, italic: false };
    const html = blocksHtml(book, blocks, ctx);
    if (html.includes('<math ')) file.math = true;
    file.body += `<section id="${sectionId}" class="${section.form ?? 'folder'}">\n${number}${html}\n</section>\n`;
  });
  close();
  return out;
}

const BASE_CSS = `
body { line-height: 1.5; margin: 0 5%; }
p { margin: 0 0 0.8em; white-space: pre-wrap; tab-size: 4; -moz-tab-size: 4; orphans: 2; widows: 2; }
p.indent { text-indent: 2em; }
h1, h2, h3, h4 { line-height: 1.25; margin: 1.6em 0 0.6em; page-break-after: avoid; break-after: avoid; }
h1 { font-size: 1.6em; }
h2 { font-size: 1.35em; }
h3 { font-size: 1.15em; }
h4 { font-size: 1em; font-style: italic; }
section.folder h1, section.folder h2 { margin-top: 3em; text-align: center; }
.title-page { text-align: center; margin-top: 30%; }
.title-page h1 { font-size: 2em; margin: 0 0 1em; }
.title-page .author, .title-page-inline .author { font-style: italic; }
.title-page-inline { text-align: center; margin: 1em 0 2em; }
.title-page-inline h1 { font-size: 1.8em; margin: 0 0 0.4em; }
.drop-cap { float: left; font-size: 3.4em; line-height: 0.85; padding: 0.06em 0.1em 0 0; }
p.has-drop-cap { text-indent: 0; }
.scene-break { text-align: center; margin: 1em 0; text-indent: 0; }
.equation { text-align: center; margin: 0.8em 0; }
code.latex { font-family: monospace; }
blockquote { margin: 0 0 0.8em 1.5em; }
.stanza { margin: 0 0 1.2em; }
.stanza p.line { margin: 0; white-space: pre-wrap; }
a.noteref { vertical-align: super; font-size: 0.7em; line-height: 0; text-decoration: none; }
section.notes { margin-top: 2em; border-top: 1px solid #999; font-size: 0.85em; }
section.notes p { margin: 0.4em 0; white-space: normal; }
mark { color: inherit; }
[dir="rtl"] .drop-cap { float: right; padding: 0.06em 0 0 0.1em; }
[dir="rtl"] blockquote { margin: 0 1.5em 0.8em 0; }
`;

/** The book's style sheet: the base rules, one @font-face for each embedded file, and each fill. */
function styleSheet(book: Book, fontFiles: { font: string; style: FontStyle; href: string }[]): string {
  const faces = fontFiles
    .map(({ font, style, href }) => {
      const weight = style === 'bold' || style === 'boldItalic' ? 700 : 400;
      const slant = style === 'italic' || style === 'boldItalic' ? 'italic' : 'normal';
      return `@font-face { font-family: '${familyOf(font)}'; font-weight: ${String(weight)}; font-style: ${slant}; src: url("${href}"); }`;
    })
    .join('\n');
  const fills = [...book.fills.values()]
    .map(({ id, fill }) => {
      const first = fill.stops[0]?.color ?? '#1f1d1b';
      const name = `.fill-${String(id)}`;
      const glow = fill.look === 'glow' ? ` text-shadow: 0 0 0.35em ${first};` : '';
      // A reader that cannot clip a background to text keeps the first color, so the words never vanish.
      return `${name} { color: ${first};${glow} }
@supports ((-webkit-background-clip: text) or (background-clip: text)) {
  ${name} { background-image: ${gradientCss(fill)}; -webkit-background-clip: text; background-clip: text; -webkit-text-fill-color: transparent; color: transparent; }
}`;
    })
    .join('\n');
  const body = `body { font-family: ${cssFamily(book.resolve(undefined))}; }`;
  return `${faces}\n${body}\n${BASE_CSS}\n${fills}\n`;
}

function styleOf(bold: boolean, italic: boolean): FontStyle {
  return bold && italic ? 'boldItalic' : bold ? 'bold' : italic ? 'italic' : 'regular';
}

/** Dates in EPUB metadata: UTC, to the second, with no fraction. */
function epubDate(date: Date): string {
  return `${date.toISOString().slice(0, 19)}Z`;
}

/** The rules of a book's chapter style, paragraphs and matter pages (F51). */
function bookCss(settings: BookSettings): string {
  const align = settings.chapter === 'modern' ? 'left' : 'center';
  return `
p { margin: 0; text-align: justify; }
p + p { text-indent: 1.5em; }
p.scene-break + p { text-indent: 0; }
.stanza p.line, section.notes p, .matter p { text-indent: 0; text-align: start; }
section.folder { page-break-before: always; break-before: page; }
section.folder h1, section.folder h2 { margin: 20% 0 2em; text-align: ${align}; font-weight: ${settings.chapter === 'classic' ? 'normal' : 'bold'}; }
section.folder h2 { font-size: ${settings.chapter === 'classic' ? '1.7em' : '1.45em'}; }
.chapter-number { margin: 20% 0 0; text-indent: 0; text-align: ${align}; line-height: 1.1; font-size: ${settings.chapter === 'modern' ? '3.2em' : '1.25em'}; }
section.folder .chapter-number + h2 { margin-top: 0.4em; }
.matter { margin-top: 30%; }
.matter p { text-align: center; }
.dedication, .epigraph { font-style: italic; }
.matter.copyright { margin-top: 60%; font-size: 0.8em; }
.matter.copyright p { text-align: left; }
`;
}

interface MatterFile {
  id: string;
  file: string;
  title: string;
  body: string;
  /** The `epub:type` of the file's body. */
  type: 'frontmatter' | 'backmatter';
}

/** The front and back matter of a book, each with text in its own file. */
function matterFiles(book: Book, settings: BookSettings): { front: MatterFile[]; back: MatterFile[] } {
  const paragraphs = (body: string) =>
    textBlocks(body)
      .map((p) => `<p>${inline(book, p.runs, { notes: [], poem: false, bold: false, italic: false })}</p>`)
      .join('\n');
  const make = (id: string, title: string, body: string, type: string, back: boolean): MatterFile[] => {
    if (body.trim() === '') return [];
    if (back) book.use(undefined, true, false);
    const html = back
      ? `<section class="folder ${id}" epub:type="${type}">\n<h2>${xmlText(title)}</h2>\n${paragraphs(body)}\n</section>`
      : `<section class="matter ${id}" epub:type="${type}">\n${paragraphs(body)}\n</section>`;
    return [{ id, file: `text/${id}.xhtml`, title, body: html, type: back ? 'backmatter' : 'frontmatter' }];
  };
  return {
    front: [
      ...make('copyright', 'Copyright', settings.copyright, 'copyright-page', false),
      ...make('dedication', 'Dedication', settings.dedication, 'dedication', false),
      ...make('epigraph', 'Epigraph', settings.epigraph, 'epigraph', false),
    ],
    back: [
      ...make('acknowledgments', 'Acknowledgments', settings.acknowledgments, 'acknowledgments', true),
      ...make('about', 'About the author', settings.about, 'backmatter', true),
    ],
  };
}

interface FontFile {
  font: string;
  style: FontStyle;
  /** The file's path in the EPUB, or under public/ for a Vlo font. */
  path: string;
  bytes?: Uint8Array;
}

/** Everything an EPUB holds but its zip: the files in reading order, the style sheet's parts and the fonts. */
function prepareEpub(doc: ExportDoc, options: Pick<EpubOptions, 'own' | 'swaps'>, toMathml: LatexToMathml) {
  const book = new Book(doc, toMathml, options.own ?? new Map(), options.swaps ?? new Map());
  book.use(undefined, false, false);
  const files = chapters(book);
  const titlePage = doc.sections.length > 1 || doc.book !== undefined;
  const author = doc.author ? `<p class="author">${xmlText(doc.author)}</p>` : '';
  if (!titlePage) {
    const first = files[0];
    if (first)
      first.body = `<header class="title-page-inline"><h1>${xmlText(doc.title)}</h1>${author}</header>\n${first.body}`;
    book.use(undefined, true, false);
  }
  const titleBody = `<section class="title-page" epub:type="titlepage"><h1>${xmlText(doc.title)}</h1>${author}</section>`;
  const { front, back } = doc.book ? matterFiles(book, doc.book) : { front: [], back: [] };

  // The font files: each style the text uses, from the closest file the font has.
  const fontFiles: FontFile[] = [];
  const drawn = new Map<string, { font: string; style: 'bold' | 'italic' }>();
  const seen = new Set<string>();
  for (const { font, bold, italic } of book.faces.values()) {
    const ownBytes = options.own?.get(font);
    if (ownBytes) {
      const key = `${font}|own`;
      if (!seen.has(key)) {
        seen.add(key);
        // An OpenType font with PostScript outlines starts with "OTTO".
        const ext = String.fromCharCode(...ownBytes.slice(0, 4)) === 'OTTO' ? 'otf' : 'ttf';
        fontFiles.push({
          font,
          style: 'regular',
          path: `fonts/own-${String(fontFiles.length + 1)}.${ext}`,
          bytes: ownBytes,
        });
      }
      if (bold) drawn.set(`${font}|bold`, { font: fontLabel(font), style: 'bold' });
      if (italic) drawn.set(`${font}|italic`, { font: fontLabel(font), style: 'italic' });
      continue;
    }
    const paths = fontPaths(font);
    const want = styleOf(bold, italic);
    const order: FontStyle[] =
      want === 'boldItalic'
        ? ['boldItalic', 'italic', 'bold', 'regular']
        : want === 'bold'
          ? ['bold', 'regular']
          : want === 'italic'
            ? ['italic', 'regular']
            : ['regular'];
    const style = order.find((s) => paths[s]) ?? 'regular';
    const path = paths[style];
    if (!path) continue;
    if (bold && style !== 'bold' && style !== 'boldItalic')
      drawn.set(`${font}|bold`, { font: fontLabel(font), style: 'bold' });
    if (italic && style !== 'italic' && style !== 'boldItalic')
      drawn.set(`${font}|italic`, { font: fontLabel(font), style: 'italic' });
    const key = `${font}|${style}`;
    if (seen.has(key)) continue;
    seen.add(key);
    fontFiles.push({ font, style, path });
  }
  /** The style sheet, with each font file at `href(file)`. */
  const css = (href: (file: FontFile) => string) =>
    styleSheet(
      book,
      fontFiles.map((f) => ({ font: f.font, style: f.style, href: href(f) })),
    ) + (doc.book ? bookCss(doc.book) : '');
  return { book, files, titlePage, titleBody, front, back, fontFiles, drawn, css };
}

/**
 * The e-reader and phone previews of the Book screen (F51): the book's XHTML and CSS in one page, with each
 * Vlo font from the app's own files under `fontBase`. An own font shows as its fallback.
 */
export async function epubPreview(doc: ExportDoc, fontBase: string): Promise<string> {
  const parts = prepareEpub(doc, {}, await mathmlFor(doc));
  const files = [
    ...(parts.titlePage ? [parts.titleBody] : []),
    ...parts.front.map((f) => f.body),
    ...parts.files.map((f) => f.body),
    ...parts.back.map((f) => f.body),
  ];
  const css = parts.css((f) => `${fontBase}${f.path}`);
  return `<!DOCTYPE html>
<html ${htmlLanguage(doc.language)}>
<head>
<meta charset="UTF-8"/>
<title>${xmlText(doc.title)}</title>
<style>${css}
html { background: #fff; color: #1f1d1b; }
body { margin: 1.5em 6%; }
.preview-file + .preview-file { margin-top: 3em; border-top: 1px solid #ddd; padding-top: 1em; }
</style>
</head>
<body>
${files.map((body) => `<div class="preview-file">${body}</div>`).join('\n')}
</body>
</html>
`;
}

/** The EPUB file of an export. */
export async function toEpub(doc: ExportDoc, options: EpubOptions): Promise<EpubResult> {
  const toMathml = options.toMathml ?? (await mathmlFor(doc));
  const { files, titlePage, titleBody, front, back, fontFiles, drawn, css } = prepareEpub(
    doc,
    options,
    toMathml,
  );
  const loaded = await Promise.all(fontFiles.map(async (f) => f.bytes ?? options.loadFile(f.path)));

  const zip = new JSZip();
  zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' });
  zip.file(
    'META-INF/container.xml',
    `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>
`,
  );
  zip.file(
    'OEBPS/styles.css',
    css((f) => f.path),
  );
  fontFiles.forEach((f, i) => {
    const bytes = loaded[i];
    if (bytes) zip.file(`OEBPS/${f.path}`, bytes);
  });
  if (titlePage) zip.file('OEBPS/text/title.xhtml', page(doc.title, titleBody, false, doc.language));
  for (const chapter of files)
    zip.file(
      `OEBPS/${chapter.file}`,
      page(chapter.title || doc.title, chapter.body, chapter.math, doc.language, chapter.type),
    );
  for (const matter of [...front, ...back])
    zip.file(`OEBPS/${matter.file}`, page(matter.title, matter.body, false, doc.language, matter.type));

  // The table of contents: the title page, then each titled section.
  const tocEntries = files.flatMap((chapter) =>
    chapter.toc
      .filter((t) => t.title !== '')
      .map((t) => ({ href: `${chapter.file}#${t.id}`, title: t.title, level: t.level })),
  );
  const firstFile = files[0]?.file;
  const links = [
    ...(titlePage ? [{ href: 'text/title.xhtml', title: doc.title }] : []),
    ...(tocEntries.length > 0
      ? tocEntries
      : firstFile && !titlePage
        ? [{ href: firstFile, title: doc.title }]
        : []),
    ...back.map((matter) => ({ href: matter.file, title: matter.title })),
  ];
  zip.file(
    'OEBPS/nav.xhtml',
    `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="${XHTML_NS}" xmlns:epub="${EPUB_NS}" ${htmlLanguage(doc.language)}>
<head>
<meta charset="UTF-8"/>
<title>${xmlText(doc.title)}</title>
</head>
<body>
<nav epub:type="toc" id="toc">
<h1>Contents</h1>
<ol>
${links.map((l) => `<li><a href="${xmlText(l.href)}">${xmlText(l.title)}</a></li>`).join('\n')}
</ol>
</nav>
</body>
</html>
`,
  );

  const id = options.id ?? `urn:uuid:${crypto.randomUUID()}`;
  const manifest = [
    '<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>',
    '<item id="css" href="styles.css" media-type="text/css"/>',
    ...(titlePage ? ['<item id="title" href="text/title.xhtml" media-type="application/xhtml+xml"/>'] : []),
    ...[...front, ...back].map(
      (matter) => `<item id="${matter.id}" href="${matter.file}" media-type="application/xhtml+xml"/>`,
    ),
    ...files.map(
      (chapter, i) =>
        `<item id="part-${String(i + 1)}" href="${chapter.file}" media-type="application/xhtml+xml"${chapter.math ? ' properties="mathml"' : ''}/>`,
    ),
    ...fontFiles.map(
      (f, i) =>
        `<item id="font-${String(i + 1)}" href="${f.path}" media-type="${f.path.endsWith('.otf') ? 'font/otf' : 'font/ttf'}"/>`,
    ),
  ];
  // A book reads: title page, front matter, contents, chapters, back matter.
  const spine = [
    ...(titlePage ? ['<itemref idref="title"/>'] : []),
    ...front.map((matter) => `<itemref idref="${matter.id}"/>`),
    ...(doc.book?.contents ? ['<itemref idref="nav"/>'] : []),
    ...files.map((_, i) => `<itemref idref="part-${String(i + 1)}"/>`),
    ...back.map((matter) => `<itemref idref="${matter.id}"/>`),
  ];
  zip.file(
    'OEBPS/content.opf',
    `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="book-id" xml:lang="${xmlText(doc.language)}">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="book-id">${xmlText(id)}</dc:identifier>
    <dc:title>${xmlText(doc.title)}</dc:title>
${doc.author ? `    <dc:creator>${xmlText(doc.author)}</dc:creator>\n` : ''}    <dc:language>${xmlText(doc.language)}</dc:language>
    <meta property="dcterms:modified">${epubDate(options.modified ?? new Date())}</meta>
  </metadata>
  <manifest>
    ${manifest.join('\n    ')}
  </manifest>
  <spine${textDirection(doc.language) === 'rtl' ? ' page-progression-direction="rtl"' : ''}>
    ${spine.join('\n    ')}
  </spine>
</package>
`,
  );
  const bytes = await zip.generateAsync({
    type: 'uint8array',
    compression: 'DEFLATE',
    mimeType: 'application/epub+zip',
  });
  return { bytes, drawnStyles: [...drawn.values()] };
}
