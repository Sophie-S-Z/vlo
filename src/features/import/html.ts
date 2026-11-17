import { escapeHtml, linesOf, outline, SCENE_BREAK, SCENE_BREAK_HTML, titleOfFile } from './outline';
import type { ImportNode } from './tree';

/*
 * Web pages and the chapters of an EPUB (roadmap F34). Vlo keeps the blocks of the page: paragraphs,
 * headings, lists, quotes and rules. Menus, scripts, forms, title pages and tables of contents stay out.
 * Pictures, sound, video and tables stay out too, and the summary counts them. The headings move up, so
 * the top level that the text uses is a Heading 1 and starts a folder, as in a Word file.
 */

/** One block of the text. `level` is 1 to 6 for a heading and 0 for every other block. */
export interface HtmlBlock {
  level: number;
  html: string;
}

/** What the reader leaves out, by the name of the thing, such as "picture". */
export type Skipped = Map<string, number>;

const DROPPED =
  'script,style,noscript,template,nav,header,footer,aside,form,button,select,textarea,iframe,svg,[hidden],[epub\\:type~="titlepage"],[epub\\:type~="toc"]';
const MEDIA = 'img,picture,video,audio,object,embed,canvas';
/** Blocks that Vlo keeps as they are. */
const BLOCKS = new Set(['P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'UL', 'OL', 'BLOCKQUOTE', 'PRE', 'HR']);
/** Boxes that hold blocks, or text that is one paragraph. */
const BOXES = new Set([
  'DIV',
  'SECTION',
  'ARTICLE',
  'MAIN',
  'LI',
  'DL',
  'DT',
  'DD',
  'FIGURE',
  'FIGCAPTION',
  'CENTER',
  'ADDRESS',
]);
const BLOCK_SELECTOR = [...BLOCKS, ...BOXES, 'TABLE'].join(',').toLowerCase();

export function count(skipped: Skipped, what: string) {
  skipped.set(what, (skipped.get(what) ?? 0) + 1);
}

/** The summary lines, such as "2 pictures". */
export function skippedList(skipped: Skipped): string[] {
  return [...skipped].map(([what, n]) => (n === 1 ? `1 ${what}` : `${String(n)} ${what}s`));
}

/** The blocks of a page's body, in reading order. */
export function htmlBlocks(body: Element, skipped: Skipped): HtmlBlock[] {
  for (const media of Array.from(body.querySelectorAll(`${MEDIA},math`))) {
    if (media.tagName.toUpperCase() === 'MATH') count(skipped, 'equation');
    // A <picture> holds an <img>, so the picture counts once.
    else if (!media.parentElement?.closest('picture')) count(skipped, 'picture');
    media.remove();
  }
  const out: HtmlBlock[] = [];
  const walk = (parent: Element) => {
    let inline = '';
    const flush = () => {
      if (inline.trim() !== '') out.push({ level: 0, html: `<p>${inline.trim()}</p>` });
      inline = '';
    };
    for (const node of Array.from(parent.childNodes)) {
      if (node.nodeType === Node.TEXT_NODE) inline += escapeHtml(node.textContent ?? '');
      if (!(node instanceof Element) || node.matches(DROPPED)) continue;
      const tag = node.tagName.toUpperCase();
      if (tag === 'TABLE') {
        flush();
        count(skipped, 'table');
      } else if (tag === 'HR' || (tag === 'P' && SCENE_BREAK.test(node.textContent))) {
        flush();
        out.push({ level: 0, html: SCENE_BREAK_HTML });
      } else if (tag === 'PRE') {
        flush();
        out.push({ level: 0, html: `<p>${linesOf(node).split('\n').map(escapeHtml).join('<br>')}</p>` });
      } else if (/^H[1-6]$/.test(tag)) {
        flush();
        if (node.textContent.trim() !== '') out.push({ level: Number(tag[1]), html: node.innerHTML });
      } else if (BLOCKS.has(tag)) {
        flush();
        if (node.textContent.trim() !== '') out.push({ level: 0, html: node.outerHTML });
      } else if (BOXES.has(tag) || node.querySelector(BLOCK_SELECTOR)) {
        flush();
        if (node.querySelector(BLOCK_SELECTOR)) walk(node);
        else if (node.textContent.trim() !== '') out.push({ level: 0, html: `<p>${node.innerHTML}</p>` });
      } else inline += node.outerHTML;
    }
    flush();
  };
  walk(body);
  return out;
}

/**
 * The items of some blocks. A first heading that repeats the title stays out. The heading levels move up:
 * the top level becomes a Heading 1, the next a Heading 2, and the rest Heading 3.
 */
export function htmlNodes(title: string, blocks: readonly HtmlBlock[]): ImportNode[] {
  const plain = (html: string) =>
    new DOMParser().parseFromString(html, 'text/html').body.textContent.trim().toLowerCase();
  const [first] = blocks;
  const rest =
    first && first.level > 0 && plain(first.html) === title.trim().toLowerCase() ? blocks.slice(1) : blocks;
  const levels = [...new Set(rest.map((b) => b.level).filter((l) => l > 0))].sort((a, b) => a - b);
  const html = rest
    .map((b) => {
      if (b.level === 0) return b.html;
      const tag = `h${String(Math.min(levels.indexOf(b.level) + 1, 3))}`;
      return `<${tag}>${b.html}</${tag}>`;
    })
    .join('');
  return outline(title, html, '\n');
}

/** A web page (.html or .htm). Its <title> names it. */
export function readHtml(name: string, source: string): { nodes: ImportNode[]; skipped: string[] } {
  const page = new DOMParser().parseFromString(source, 'text/html');
  const skipped: Skipped = new Map();
  const title = page.title.trim() || titleOfFile(name);
  return { nodes: htmlNodes(title, htmlBlocks(page.body, skipped)), skipped: skippedList(skipped) };
}
