import type { ImportNode, ImportText } from './tree';

/*
 * Word and Markdown files arrive as HTML. A Heading 1 starts a folder and a Heading 2 starts an item,
 * as the Vlo exports write them. A file with no such headings is one item.
 */

/** A folder name without a number in front of a word, such as "01 " from a Vlo export. */
export function titleOfName(name: string): string {
  return name.replace(/^\d+[\s._-]+(?=[^\d\s._-])/, '').trim() || 'Untitled';
}

/** A file name without its extension, as `titleOfName` gives it. */
export function titleOfFile(name: string): string {
  return titleOfName(name.replace(/\.[^.]+$/, ''));
}

export function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** The text of an element with each line break as a line feed. No-break spaces become spaces. */
export function linesOf(element: Element): string {
  let out = '';
  const visit = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) out += (node.textContent ?? '').replace(/\u00a0/g, ' ');
    else if (node.nodeName === 'BR') out += '\n';
    else if (!(node instanceof Element && node.matches('sup[data-footnote]'))) node.childNodes.forEach(visit);
  };
  visit(element);
  return out;
}

interface Section {
  level: 0 | 1 | 2;
  title: string;
  blocks: Element[];
}

/**
 * Splits HTML at its `h1` and `h2` elements. `stanzaGap` joins the blocks of a poem: "\n" when each
 * paragraph is a line (Word), "\n\n" when each paragraph is a stanza (Markdown). Word paragraphs that hold
 * line breaks are stanzas too, so a poem typed with Shift+Enter keeps its stanza breaks.
 */
export function outline(title: string, html: string, stanzaGap: '\n' | '\n\n'): ImportNode[] {
  const body = new DOMParser().parseFromString(html, 'text/html').body;
  const sections: Section[] = [{ level: 0, title, blocks: [] }];
  for (const element of Array.from(body.children)) {
    const level = element.tagName === 'H1' ? 1 : element.tagName === 'H2' ? 2 : 0;
    if (level === 0) sections.at(-1)?.blocks.push(element);
    else sections.push({ level, title: linesOf(element).trim() || title, blocks: [] });
  }
  const text = (blocks: Element[]): ImportText | undefined =>
    blocks.length === 0
      ? undefined
      : {
          html: blocks.map((b) => b.outerHTML).join(''),
          poem: `${blocks.map(linesOf).join(blocks.some((b) => b.querySelector('br')) ? '\n\n' : stanzaGap)}\n`,
        };

  const nodes: ImportNode[] = [];
  let folder: ImportNode | null = null;
  for (const section of sections) {
    const own = text(section.blocks);
    if (section.level === 1) {
      folder = { title: section.title, children: [], ...(own ? { text: own } : {}) };
      nodes.push(folder);
    } else if (section.level === 2 || own) {
      const item: ImportNode = { title: section.title, ...(own ? { text: own } : {}) };
      (folder?.children ?? nodes).push(item);
    }
  }
  // A Heading 1 with no Heading 2 under it is an item, not an empty folder.
  return nodes.map((node) =>
    node.children?.length === 0 ? { title: node.title, ...(node.text ? { text: node.text } : {}) } : node,
  );
}
