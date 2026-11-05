import type { NoteContent } from '@/features/editor/format/notes';
import type { Block, ExportDoc, Run } from '@/features/export/model';

/*
 * Share-safe export (spec sections 8.2 and 9, plan Tasks B1 and C5). Every export passes through
 * `shareSafe`. With the switch on, each marked private name becomes the alias of its person. Then each
 * unmarked exact match of a real name becomes its alias too, longest name first, in the text, the
 * headings, the notes and the titles. `nameCheck` lists the unmarked names for the check before export.
 */

export interface Alias {
  /** The real name as it appears in the text, such as "Aunt Rosa". */
  name: string;
  /** The name to show instead, such as "Aunt Maria". */
  alias: string;
}

/** One way the text names a person, and the alias for it. */
export interface NameVariant {
  real: string;
  alias: string;
}

/** The part of a person row that share-safe export reads. */
export interface PrivatePerson {
  id: string;
  variants: readonly NameVariant[];
}

/** True for a letter or a digit in any script, so "Rosa" never matches inside "Rosalind". */
const WORD = /[\p{L}\p{N}]/u;

interface Match {
  from: number;
  to: number;
  name: string;
  alias: string;
}

type TextRun = Extract<Run, { type: 'text' }>;

/** The alias list ready for matching: longest names first, so "Aunt Rosa" wins over "Rosa". */
function prepare(aliases: readonly Alias[]): Alias[] {
  return aliases
    .map((a) => ({ name: a.name.trim(), alias: a.alias.trim() }))
    .filter((a) => a.name !== '' && a.name !== a.alias)
    .sort((a, b) => b.name.length - a.name.length);
}

/** Every variant of every person as one alias list. */
export function aliasesOf(people: readonly PrivatePerson[]): Alias[] {
  return people.flatMap((person) => person.variants.map((v) => ({ name: v.real, alias: v.alias })));
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
      if (whole && free) taken.push({ from, to, name, alias });
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

/** The people by id, each with its alias list ready for matching. */
interface Lookup {
  all: Alias[];
  byId: Map<string, { first: string; own: Alias[] }>;
}

function lookupOf(people: readonly PrivatePerson[]): Lookup {
  const byId = new Map<string, { first: string; own: Alias[] }>();
  for (const person of people) {
    const own = prepare(person.variants.map((v) => ({ name: v.real, alias: v.alias })));
    const first = person.variants.map((v) => v.alias.trim()).find((a) => a !== '');
    if (first !== undefined) byId.set(person.id, { first, own });
  }
  return { all: prepare(aliasesOf(people)), byId };
}

/**
 * The text that takes the place of a marked name. The exact name gives its own alias. Marked text with
 * more around the name, such as "Rosa’s", keeps the rest. Marked text with no name of the person in it,
 * such as a name that the writer split, gives the person's first alias, so no part of it shows.
 */
function markedAlias(
  text: string,
  person: { first: string; own: Alias[] },
): { text: string; known: boolean } {
  const trimmed = text.trim();
  const exact = person.own.find((a) => a.name === trimmed);
  if (exact) return { text: text.replace(trimmed, exact.alias), known: true };
  const matches = findMatches(text, person.own);
  if (matches.length > 0) return { text: replaceIn(text, matches), known: true };
  return { text: person.first, known: false };
}

/** The unmarked names in a plain string, for the alias preview in the editor. */
export function findNames(
  text: string,
  people: readonly PrivatePerson[],
): { from: number; to: number; name: string; alias: string }[] {
  return findMatches(text, prepare(aliasesOf(people)));
}

/** The text that takes the place of a marked name, or null when no person has this id. */
export function markedAliasFor(
  text: string,
  people: readonly PrivatePerson[],
  personId: string,
): string | null {
  const person = lookupOf(people).byId.get(personId);
  return person ? markedAlias(text, person).text : null;
}

/** A line of runs cut into marked names and the unmarked text between them. */
type Piece = { marked: false; runs: TextRun[] } | { marked: true; runs: TextRun[]; person: string };

function piecesOf(group: readonly TextRun[], lookup: Lookup): Piece[] {
  const pieces: Piece[] = [];
  for (const run of group) {
    const person = run.person !== undefined && lookup.byId.has(run.person) ? run.person : null;
    const last = pieces[pieces.length - 1];
    if (person === null) {
      if (last && !last.marked) last.runs.push(run);
      else pieces.push({ marked: false, runs: [run] });
    } else if (last?.marked && last.person === person) {
      last.runs.push(run);
    } else {
      pieces.push({ marked: true, runs: [run], person });
    }
  }
  return pieces;
}

/** A text run without the person id, which no file format needs. */
function plain(run: TextRun, text: string = run.text): TextRun {
  return { type: 'text', text, style: run.style };
}

/**
 * Replaces names in unmarked text runs. A name can cross from one run into the next, as in
 * "Aunt *Rosa*", so the runs are read as one text. The alias takes the style of the run where the name
 * starts.
 */
function aliasUnmarked(group: readonly TextRun[], aliases: readonly Alias[]): TextRun[] {
  const text = group.map((r) => r.text).join('');
  const matches = findMatches(text, aliases);
  if (matches.length === 0) return group.map((r) => plain(r));
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
  const pieces: TextRun[] = [];
  const keep = (from: number, to: number) => {
    // The text between matches keeps the style of each run it came from.
    let at = from;
    while (at < to) {
      const index = runAt(at);
      const run = group[index];
      if (!run) break;
      const end = Math.min(to, (starts[index] ?? 0) + run.text.length);
      pieces.push(plain(run, text.slice(at, end)));
      at = end;
    }
  };
  let pos = 0;
  for (const m of matches) {
    keep(pos, m.from);
    const run = group[runAt(m.from)];
    if (run && m.alias !== '') pieces.push(plain(run, m.alias));
    pos = m.to;
  }
  keep(pos, text.length);
  return pieces.filter((p) => p.text !== '');
}

/** Joins runs of the same style, so an alias and the words around it make one run in each format. */
function joinRuns(runs: readonly TextRun[]): TextRun[] {
  const out: TextRun[] = [];
  for (const run of runs) {
    const last = out[out.length - 1];
    if (last && JSON.stringify(last.style) === JSON.stringify(run.style)) last.text += run.text;
    else out.push({ ...run });
  }
  return out;
}

function aliasGroup(group: readonly TextRun[], lookup: Lookup): TextRun[] {
  return joinRuns(
    piecesOf(group, lookup).flatMap((piece) => {
      if (!piece.marked) return aliasUnmarked(piece.runs, lookup.all);
      const person = lookup.byId.get(piece.person);
      const first = piece.runs[0];
      if (!person || !first) return [];
      const alias = markedAlias(piece.runs.map((r) => r.text).join(''), person).text;
      return alias === '' ? [] : [plain(first, alias)];
    }),
  );
}

/** Calls `onGroup` for each line of text runs, and passes the other runs through. */
function mapRuns(
  runs: readonly Run[],
  onGroup: (group: TextRun[]) => TextRun[],
  onNote: (note: NoteContent) => NoteContent,
): Run[] {
  const out: Run[] = [];
  let group: TextRun[] = [];
  const flush = () => {
    if (group.length > 0) out.push(...onGroup(group));
    group = [];
  };
  for (const run of runs) {
    if (run.type === 'text') {
      group.push(run);
      continue;
    }
    flush();
    out.push(run.type === 'footnote' ? { ...run, note: onNote(run.note) } : run);
  }
  flush();
  return out;
}

function mapBlocks(blocks: readonly Block[], onRuns: (runs: readonly Run[]) => Run[]): Block[] {
  return blocks.map((block): Block => {
    switch (block.type) {
      case 'paragraph':
      case 'heading':
        return { ...block, runs: onRuns(block.runs) };
      case 'list':
        return { ...block, items: block.items.map((item) => mapBlocks(item, onRuns)) };
      case 'quote':
        return { ...block, blocks: mapBlocks(block.blocks, onRuns) };
      case 'stanza':
        return { ...block, lines: block.lines.map((line) => ({ ...line, runs: onRuns(line.runs) })) };
      default:
        return block;
    }
  });
}

/** The export with each private name replaced by its alias, when `on` is true. */
export function shareSafe(doc: ExportDoc, people: readonly PrivatePerson[], on: boolean): ExportDoc {
  const lookup = lookupOf(people);
  if (!on || lookup.all.length === 0) return doc;
  const onNote = (note: NoteContent): NoteContent =>
    note.map((run) => ({ ...run, text: replaceIn(run.text, findMatches(run.text, lookup.all)) }));
  const onRuns = (runs: readonly Run[]) => mapRuns(runs, (group) => aliasGroup(group, lookup), onNote);
  return {
    ...doc,
    title: aliasText(doc.title, lookup.all),
    sections: doc.sections.map((section) => ({
      ...section,
      title: aliasText(section.title, lookup.all),
      blocks: mapBlocks(section.blocks, onRuns),
    })),
  };
}

export interface NameCount {
  name: string;
  count: number;
}

/** What the check before a share-safe export found in the text. */
export interface NameCheck {
  /** Real names in the text with no mark, longest first. The export still swaps each for its alias. */
  unmarked: NameCount[];
  /**
   * Marked text that holds no name of its person, such as a name that the writer split. The export
   * puts the person's first alias in its place.
   */
  changed: NameCount[];
}

function counted(counts: Map<string, number>, longestFirst: boolean): NameCount[] {
  return [...counts]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => (longestFirst ? b.name.length - a.name.length : 0) || a.name.localeCompare(b.name));
}

/**
 * The unmarked real names and the changed marked names in the text of an export. Titles and notes have no
 * marks, so the check reads only the text, where "Mark all" can add a mark.
 */
export function nameCheck(doc: ExportDoc, people: readonly PrivatePerson[]): NameCheck {
  const lookup = lookupOf(people);
  const unmarked = new Map<string, number>();
  const changed = new Map<string, number>();
  if (lookup.all.length === 0) return { unmarked: [], changed: [] };
  const add = (counts: Map<string, number>, name: string) => {
    counts.set(name, (counts.get(name) ?? 0) + 1);
  };
  const onGroup = (group: TextRun[]) => {
    for (const piece of piecesOf(group, lookup)) {
      const text = piece.runs.map((r) => r.text).join('');
      if (!piece.marked) {
        for (const m of findMatches(text, lookup.all)) add(unmarked, m.name);
        continue;
      }
      const person = lookup.byId.get(piece.person);
      if (person && !markedAlias(text, person).known) add(changed, text);
    }
    return group;
  };
  const onRuns = (runs: readonly Run[]) => mapRuns(runs, onGroup, (note) => note);
  for (const section of doc.sections) {
    // Headings at levels 1 and 2 are folder and item titles, not text.
    mapBlocks(
      section.blocks.filter((b) => b.type !== 'heading' || b.level > 2),
      onRuns,
    );
  }
  return { unmarked: counted(unmarked, true), changed: counted(changed, false) };
}
