import type { NoteContent } from '@/features/editor/format/notes';
import { footnotesOf, repeatsTitle, type Block, type ExportDoc, type Run, type RunStyle } from './model';

/*
 * Markdown export (spec section 9). Poem lines keep every space: each leading space becomes U+00A0, each
 * line ends with a backslash hard break, and a blank line separates stanzas. Footnotes use [^1].
 * Equations keep $...$ and $$...$$. Markdown has no color, font or size, so those runs keep their text.
 * Underline, highlight, superscript and subscript use the HTML tags that most Markdown readers show.
 */

const NBSP = ' ';

/** Escapes the characters that Markdown would read as formatting. */
export function escapeMarkdown(text: string): string {
  return text.replace(/([\\`*_{}[\]<>#+!|~$])/g, '\\$1');
}

/** A line must not start with characters that open a block: a heading, a list, a quote or a rule. */
function guardLineStart(line: string): string {
  return line.replace(/^(\s*)(\d+)([.)])(\s)/, '$1$2\\$3$4').replace(/^(\s*)([-=])(?=\s|$)/, '$1\\$2');
}

function wrap(text: string, style: RunStyle): string {
  if (text === '') return '';
  // Spaces stay outside the markers, because "** bold**" is not bold in Markdown.
  const lead = /^\s*/.exec(text)?.[0] ?? '';
  const trail = /\s*$/.exec(text.slice(lead.length))?.[0] ?? '';
  let core = text.slice(lead.length, text.length - trail.length);
  if (core === '') return text;
  if (style.superscript) core = `<sup>${core}</sup>`;
  if (style.subscript) core = `<sub>${core}</sub>`;
  if (style.highlight) core = `<mark>${core}</mark>`;
  if (style.underline) core = `<u>${core}</u>`;
  if (style.strike) core = `~~${core}~~`;
  if (style.italic) core = `*${core}*`;
  if (style.bold) core = `**${core}**`;
  if (style.link) core = `[${core}](${style.link.replace(/[()\s]/g, encodeURIComponent)})`;
  return lead + core + trail;
}

function inline(runs: readonly Run[], options: { poem: boolean }): string {
  let out = '';
  for (const run of runs) {
    if (run.type === 'text') out += wrap(escapeMarkdown(run.text), run.style);
    else if (run.type === 'break') out += options.poem ? ' ' : '\\\n';
    else if (run.type === 'math') out += `$${run.latex}$`;
    else out += `[^${String(run.number)}]`;
  }
  return out;
}

function poemLine(runs: readonly Run[]): string {
  const text = inline(runs, { poem: true });
  // Leading spaces would start a code block or vanish, so each one becomes a no-break space.
  const lead = /^ */.exec(text)?.[0].length ?? 0;
  // A reader shows a run of spaces as one space, so each space after the first becomes a no-break space.
  const rest = text.slice(lead).replace(/ {2,}/g, (spaces) => ` ${NBSP.repeat(spaces.length - 1)}`);
  return guardLineStart(NBSP.repeat(lead) + rest);
}

function blockMarkdown(block: Block, depth = 0): string {
  const indent = '   '.repeat(depth);
  switch (block.type) {
    case 'paragraph':
      return guardLineStart(inline(block.runs, { poem: false }));
    case 'heading':
      return `${'#'.repeat(block.level)} ${inline(block.runs, { poem: false })}`;
    case 'sceneBreak':
      return '***';
    case 'math':
      return `$$${block.latex}$$`;
    case 'quote':
      return block.blocks
        .map((b) => blockMarkdown(b))
        .join('\n\n')
        .split('\n')
        .map((line) => (line === '' ? '>' : `> ${line}`))
        .join('\n');
    case 'list':
      return block.items
        .map((item, i) => {
          const marker = block.ordered ? `${String(block.start + i)}. ` : '- ';
          const body = item.map((b) => blockMarkdown(b, depth + 1)).join('\n\n');
          const [first = '', ...rest] = body.split('\n');
          const pad = ' '.repeat(marker.length);
          return `${indent}${marker}${first.trimStart()}${rest.map((l) => (l === '' ? '' : `\n${indent}${pad}${l.trimStart()}`)).join('')}`;
        })
        .join('\n');
    case 'stanza': {
      const lines = block.lines.map((line) => poemLine(line.runs));
      // Every line but the last ends with a hard break, so the stanza stays one block of lines.
      return lines.map((line, i) => (i < lines.length - 1 ? `${line}\\` : line)).join('\n');
    }
  }
}

function noteMarkdown(note: NoteContent): string {
  return note
    .map((run) => {
      const marks = new Set(run.marks?.map((m) => m.type));
      return wrap(escapeMarkdown(run.text), {
        ...(marks.has('bold') ? { bold: true } : {}),
        ...(marks.has('italic') ? { italic: true } : {}),
        ...(marks.has('underline') ? { underline: true } : {}),
        ...(marks.has('strike') ? { strike: true } : {}),
        ...(marks.has('superscript') ? { superscript: true } : {}),
        ...(marks.has('subscript') ? { subscript: true } : {}),
      });
    })
    .join('');
}

/** The Markdown text of an export, with a title line and the notes at the end. */
export function toMarkdown(doc: ExportDoc): string {
  const parts: string[] = [`# ${escapeMarkdown(doc.title)}`];
  if (doc.author) parts.push(`*${escapeMarkdown(doc.author)}*`);
  for (const section of doc.sections) {
    for (const block of section.blocks) {
      if (repeatsTitle(doc, section, block)) continue;
      parts.push(blockMarkdown(block));
    }
  }
  const notes = footnotesOf(doc);
  if (notes.length > 0) {
    parts.push(notes.map((n) => `[^${String(n.number)}]: ${noteMarkdown(n.note)}`).join('\n'));
  }
  return `${parts.filter((p) => p !== '').join('\n\n')}\n`;
}
