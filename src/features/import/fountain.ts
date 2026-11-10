import type { ScriptRole } from '@/features/editor/scriptRoles';
import { escapeHtml, titleOfFile } from './outline';
import type { ImportNode } from './tree';

/*
 * A Fountain file (roadmap 2 F63, plan Task M3, fountain.io/syntax). Each scene heading starts a scene in
 * the binder. A "#" section starts an act, and "##" or more starts a sequence. A "=" synopsis goes on the
 * scene or folder. The title page gives the title and the author. Notes, boneyard and other marks stay
 * in the text, so no word is lost.
 */

export interface FountainFile {
  title: string;
  author?: string;
  nodes: ImportNode[];
}

interface Line {
  role: ScriptRole;
  text: string;
}

const HEADING = /^(?:INT|EXT|EST|INT\.?\/EXT|I\/E)[. ]/i;
const TRANSITION = /^[^\p{Ll}]*TO:$/u;

/** Fountain's emphasis as the HTML that the editor reads. A backslash keeps a star or a line as text. */
function emphasis(text: string): string {
  const kept: string[] = [];
  const marked = escapeHtml(text)
    .replace(/\\([\\*_])/g, (_, char: string) => `\uE000${String(kept.push(char) - 1)}\uE001`)
    .replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/_(.+?)_/g, '<u>$1</u>');
  return marked.replace(/\uE000(\d+)\uE001/g, (_, i: string) => kept[Number(i)] ?? '');
}

/** The plain text of a line, without its emphasis marks, for counts and the poem form. */
function plain(text: string): string {
  return new DOMParser().parseFromString(emphasis(text), 'text/html').body.textContent;
}

const TITLE_KEY =
  /^(title|credit|authors?|source|draft date|date|contact|notes|copyright|revision):\s*(.*)$/i;

/** The title page: "Key: value" lines up to the first blank line. A value can go on indented lines. */
function titlePage(lines: readonly string[]): { fields: Map<string, string>; end: number } {
  const fields = new Map<string, string>();
  if (!TITLE_KEY.test(lines[0] ?? '')) return { fields, end: 0 };
  let key = '';
  let i = 0;
  for (; i < lines.length && (lines[i] ?? '').trim() !== ''; i += 1) {
    const line = lines[i] ?? '';
    const field = TITLE_KEY.exec(line);
    if (field?.[1] !== undefined) {
      key = field[1].toLowerCase();
      fields.set(key, (field[2] ?? '').trim());
    } else if (key !== '') {
      fields.set(key, [fields.get(key), line.trim()].filter(Boolean).join(' '));
    }
  }
  return { fields, end: i };
}

export function readFountain(name: string, source: string): FountainFile {
  const all = source
    .replace(/^\uFEFF/, '')
    .replace(/\r\n?/g, '\n')
    .split('\n');
  const { fields, end } = titlePage(all);
  const lines = all.slice(end);
  const nodes: ImportNode[] = [];
  let act: ImportNode | null = null;
  let folder: ImportNode | null = null;
  let scene: { node: ImportNode; lines: Line[] } | null = null;
  const scenes: { node: ImportNode; lines: Line[] }[] = [];

  const place = (node: ImportNode) => {
    (folder?.children ?? nodes).push(node);
  };
  const add = (role: ScriptRole, text: string) => {
    if (!scene || (role === 'heading' && scene.lines.length > 0)) {
      scene = { node: { title: role === 'heading' ? plain(text) : 'Opening' }, lines: [] };
      scenes.push(scene);
      place(scene.node);
    }
    scene.lines.push({ role, text });
  };

  let blankBefore = true;
  let speech = false;
  lines.forEach((raw, i) => {
    const text = raw.trim();
    const next = (lines[i + 1] ?? '').trim();
    // Two spaces keep a blank line inside a speech.
    if (text === '' && !(speech && raw === '  ')) {
      blankBefore = true;
      speech = false;
      return;
    }
    const section = /^(#+)\s*(.*)$/.exec(text);
    const synopsis = /^=(?!==)\s*(.*)$/.exec(text);
    if (section) {
      const node: ImportNode = { title: section[2] ?? 'Untitled', children: [] };
      if ((section[1] ?? '').length === 1 || !act) {
        nodes.push(node);
        act = node;
      } else {
        act.children?.push(node);
      }
      folder = node;
      scene = null;
    } else if (synopsis) {
      const target: ImportNode | null = scene?.node ?? folder;
      if (target) target.synopsis = [target.synopsis, synopsis[1]].filter(Boolean).join(' ');
      else add('action', synopsis[1] ?? '');
    } else if (/^={3,}$/.test(text)) {
      // A page break has no text.
    } else if (text.startsWith('!')) add('action', text.slice(1));
    else if (text.startsWith('@')) {
      add('character', text.slice(1).trim());
      speech = true;
    } else if (text.startsWith('~')) add('lyric', text.slice(1).trim());
    else if (text.startsWith('>') && text.endsWith('<')) add('action', text.slice(1, -1).trim());
    else if (text.startsWith('>')) add('transition', text.slice(1).trim());
    else if (/^\.[^.]/.test(text)) add('heading', text.slice(1).trim());
    else if (speech) add(/^\(.*\)$/.test(text) ? 'parenthetical' : 'dialogue', text);
    else if (blankBefore && HEADING.test(text)) add('heading', text);
    else if (blankBefore && next === '' && TRANSITION.test(text)) add('transition', text);
    else if (
      blankBefore &&
      next !== '' &&
      /\p{L}/u.test(text) &&
      !/\p{Ll}/u.test(text.replace(/\(.*\)/g, ''))
    ) {
      add('character', text);
      speech = true;
    } else add('action', text);
    // A section, a synopsis or a page break stands on its own, as a blank line does.
    blankBefore = Boolean(section ?? synopsis) || /^={3,}$/.test(text);
  });

  for (const { node, lines: own } of scenes) {
    node.text = {
      html: own.map((line) => `<p data-role="${line.role}">${emphasis(line.text)}</p>`).join(''),
      poem: `${own.map((line) => plain(line.text)).join('\n')}\n`,
    };
  }
  const title = fields.get('title') ?? titleOfFile(name);
  const author = fields.get('author') ?? fields.get('authors');
  return { title: plain(title) || titleOfFile(name), ...(author ? { author: plain(author) } : {}), nodes };
}
