import MarkdownIt from 'markdown-it';
import { escapeHtml, outline, titleOfFile } from './outline';
import type { ImportNode } from './tree';

/*
 * Markdown and plain text files (roadmap F34). Front matter gives the title and the synopsis. Obsidian
 * wiki links keep their text, and [^1] footnotes become Vlo footnotes. Inline HTML such as <u> stays, as
 * the Vlo export writes it: the editor's own rules read the result, as for a paste, so only the marks
 * that Vlo knows remain.
 */

const markdown = new MarkdownIt({ html: true });
// A hard break is a <br> only. The line feed after it would make one more line in a poem.
markdown.renderer.rules.hardbreak = () => '<br>';

/** The plain text of one line of Markdown, such as a footnote. */
function plainText(line: string): string {
  return new DOMParser().parseFromString(markdown.renderInline(line), 'text/html').body.textContent.trim();
}

/** Puts each footnote's text in its reference, as the editor's footnote reads it from a paste. */
function footnotes(text: string): string {
  const notes = new Map<string, string>();
  const body = text.replace(/^\[\^([^\]]+)\]:[ \t]*(.*)$/gm, (_, id: string, note: string) => {
    notes.set(id, plainText(note));
    return '';
  });
  return body.replace(/\[\^([^\]]+)\]/g, (ref, id: string) => {
    const note = notes.get(id);
    return note === undefined
      ? ref
      : `<sup data-footnote="" data-note="${escapeHtml(JSON.stringify(note))}"></sup>`;
  });
}

function frontMatter(text: string): { body: string; fields: Record<string, string> } {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(text);
  if (!match) return { body: text, fields: {} };
  const fields: Record<string, string> = {};
  for (const line of (match[1] ?? '').split(/\r?\n/)) {
    const field = /^(\w+):\s*(.*)$/.exec(line);
    if (field?.[1] && field[2]) fields[field[1].toLowerCase()] = field[2].replace(/^["']|["']$/g, '');
  }
  return { body: text.slice(match[0].length), fields };
}

/** A task list item of GitHub Markdown: "- [ ] " or "- [x] " at the start of the item. */
const TASK = /^\[([ xX])\]\s+/;

/** Makes each list whose items all start with a task box a checklist, as the editor reads one. */
function taskLists(html: string): string {
  if (!html.includes('[')) return html;
  const doc = new DOMParser().parseFromString(html, 'text/html');
  for (const list of doc.querySelectorAll('ul')) {
    const items = [...list.children].filter((child) => child.tagName === 'LI');
    // The box is in the first text of the item, or of its first paragraph in a loose list.
    const firsts = items.map(
      (item) => (item.firstElementChild?.tagName === 'P' ? item.firstElementChild : item).firstChild,
    );
    if (
      items.length === 0 ||
      !firsts.every((node) => node?.nodeType === Node.TEXT_NODE && TASK.test(node.textContent ?? ''))
    )
      continue;
    list.setAttribute('data-type', 'taskList');
    items.forEach((item, i) => {
      const text = firsts[i];
      if (!text) return;
      const done = TASK.exec(text.textContent ?? '')?.[1] !== ' ';
      text.textContent = (text.textContent ?? '').replace(TASK, '');
      item.setAttribute('data-type', 'taskItem');
      item.setAttribute('data-checked', String(done));
    });
  }
  return doc.body.innerHTML;
}

/** A Markdown file. Its `#` and `##` headings split it into a folder and items. */
export function readMarkdown(name: string, text: string): ImportNode[] {
  const { body, fields } = frontMatter(text.replace(/^\uFEFF/, ''));
  const plain = body.replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, '$2').replace(/\[\[([^\]]+)\]\]/g, '$1');
  const title = fields.title ?? titleOfFile(name);
  const nodes = outline(title, taskLists(markdown.render(footnotes(plain))), '\n\n');
  // A file that is one item keeps the title and the synopsis from its front matter.
  const [only] = nodes;
  if (nodes.length === 1 && only && !only.children)
    return [{ ...only, title, ...(fields.synopsis ? { synopsis: fields.synopsis } : {}) }];
  return nodes;
}

/** A plain text file is one item. A blank line ends a paragraph, and each line break stays. */
export function readPlainText(name: string, text: string): ImportNode {
  const clean = text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  const html = clean
    .split(/\n\s*\n/)
    .filter((p) => p.trim() !== '')
    .map((p) => `<p>${p.split('\n').map(escapeHtml).join('<br>')}</p>`)
    .join('');
  return { title: titleOfFile(name), text: { html, poem: clean.endsWith('\n') ? clean : `${clean}\n` } };
}
