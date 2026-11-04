import type { NoteContent } from '@/features/editor/format/notes';
import type { Block, ExportDoc, Run } from '@/features/export/model';

/*
 * Share-safe export (spec section 9, plan Task B1). Every export passes through `shareSafe`. With the
 * switch on, each private name becomes its alias in the text, the headings, the notes and the titles.
 * The switch is on by default for memoir. People and their aliases arrive in Phase 3; until then a
 * project has an empty list, and the export keeps the text as written.
 */

export interface Alias {
  /** The real name as it appears in the text, such as "Aunt Rosa". */
  name: string;
  /** The name to show instead, such as "Aunt Mae". */
  alias: string;
}

/** True for a letter or a digit in any script, so "Rosa" never matches inside "Rosalind". */
const WORD = /[\p{L}\p{N}]/u;

interface Match {
  from: number;
  to: number;
  alias: string;
}

/** The alias list ready for matching: longest names first, so "Aunt Rosa" wins over "Rosa". */
function prepare(aliases: readonly Alias[]): Alias[] {
  return aliases
    .map((a) => ({ name: a.name.trim(), alias: a.alias.trim() }))
    .filter((a) => a.name !== '' && a.name !== a.alias)
    .sort((a, b) => b.name.length - a.name.length);
}

/** Whole-word matches of each name in `text`, without overlaps, in text order. */
function findMatches(text: string, aliases: readonly Alias[]): Match[] {
  const taken: Match[] = [];
  for (const { name, alias } of aliases) {
    let from = text.indexOf(name);
    while (from !== -1) {
      const to = from + name.length;
      const before = text[from - 1] ?? '';
      const after = text[to] ?? '';
      const whole = !WORD.test(before) && !WORD.test(after);
      const free = taken.every((m) => to <= m.from || from >= m.to);
      if (whole && free) taken.push({ from, to, alias });
      from = text.indexOf(name, from + 1);
    }
  }
  return taken.sort((a, b) => a.from - b.from);
}

/** Replaces each name in a plain string. */
export function aliasText(text: string, aliases: readonly Alias[]): string {
  const list = prepare(aliases);
  if (list.length === 0) return text;
  return replaceIn(text, findMatches(text, list));
}

function replaceIn(text: string, matches: readonly Match[]): string {
  let out = '';
  let at = 0;
  for (const m of matches) {
    out += text.slice(at, m.from) + m.alias;
    at = m.to;
  }
  return out + text.slice(at);
}

/**
 * Replaces names across a line of text runs. A name can cross from one run into the next, as in
 * "Aunt *Rosa*", so the runs are read as one text. The alias takes the style of the run where the name
 * starts.
 */
function aliasRuns(runs: readonly Run[], aliases: readonly Alias[]): Run[] {
  const out: Run[] = [];
  let group: Extract<Run, { type: 'text' }>[] = [];
  const flush = () => {
    if (group.length === 0) return;
    const text = group.map((r) => r.text).join('');
    const matches = findMatches(text, aliases);
    if (matches.length === 0) {
      out.push(...group);
      group = [];
      return;
    }
    // The start offset of each run in the joined text.
    const starts: number[] = [];
    let offset = 0;
    for (const run of group) {
      starts.push(offset);
      offset += run.text.length;
    }
    const runAt = (pos: number) => {
      let index = 0;
      for (let i = 0; i < starts.length; i += 1) if ((starts[i] ?? 0) <= pos) index = i;
      return index;
    };
    let pos = 0;
    const pieces: Extract<Run, { type: 'text' }>[] = [];
    const keep = (from: number, to: number) => {
      // The text between matches keeps the style of each run it came from.
      let at = from;
      while (at < to) {
        const index = runAt(at);
        const run = group[index];
        if (!run) break;
        const end = Math.min(to, (starts[index] ?? 0) + run.text.length);
        pieces.push({ type: 'text', text: text.slice(at, end), style: run.style });
        at = end;
      }
    };
    for (const m of matches) {
      keep(pos, m.from);
      const run = group[runAt(m.from)];
      if (run && m.alias !== '') pieces.push({ type: 'text', text: m.alias, style: run.style });
      pos = m.to;
    }
    keep(pos, text.length);
    out.push(...pieces.filter((p) => p.text !== ''));
    group = [];
  };
  for (const run of runs) {
    if (run.type === 'text') {
      group.push(run);
      continue;
    }
    flush();
    out.push(run.type === 'footnote' ? { ...run, note: aliasNote(run.note, aliases) } : run);
  }
  flush();
  return out;
}

function aliasNote(note: NoteContent, aliases: readonly Alias[]): NoteContent {
  return note.map((run) => ({ ...run, text: replaceIn(run.text, findMatches(run.text, aliases)) }));
}

function aliasBlocks(blocks: readonly Block[], aliases: readonly Alias[]): Block[] {
  return blocks.map((block): Block => {
    switch (block.type) {
      case 'paragraph':
      case 'heading':
        return { ...block, runs: aliasRuns(block.runs, aliases) };
      case 'list':
        return { ...block, items: block.items.map((item) => aliasBlocks(item, aliases)) };
      case 'quote':
        return { ...block, blocks: aliasBlocks(block.blocks, aliases) };
      case 'stanza':
        return {
          ...block,
          lines: block.lines.map((line) => ({ ...line, runs: aliasRuns(line.runs, aliases) })),
        };
      default:
        return block;
    }
  });
}

/** The export with each private name replaced by its alias, when `on` is true. */
export function shareSafe(doc: ExportDoc, aliases: readonly Alias[], on: boolean): ExportDoc {
  const list = prepare(aliases);
  if (!on || list.length === 0) return doc;
  return {
    ...doc,
    title: aliasText(doc.title, list),
    sections: doc.sections.map((section) => ({
      ...section,
      title: aliasText(section.title, list),
      blocks: aliasBlocks(section.blocks, list),
    })),
  };
}
