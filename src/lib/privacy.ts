import { BOOK_TEXTS } from '@/features/book/book';
import type { NoteContent } from '@/features/editor/format/notes';
import type { Block, ExportDoc, Run } from '@/features/export/model';

/*
 * Share-safe export (spec sections 8.2 and 9, plan Tasks B1 and C5). Every export passes through
 * `shareSafe`. With the switch on, each marked private name becomes the alias of its person. Then each
 * unmarked exact match of a real name becomes its alias too, longest name first, in the text, the
 * headings, the notes, the equations and the titles. A link whose address holds a real name loses its
 * address. The book's front and back matter is plain text, so each name in it is unmarked. `nameCheck`
 * lists the unmarked names for the check before export.
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
/** One character with the accents that follow it, so a match never cuts an accent from its letter. */
const SEGMENT = /\P{M}\p{M}*|\p{M}+/gu;
const QUOTES = /[\u2018\u2019\u02BC\u2032]/g;
const SPACES = /[\u00A0\u2007\u2009\u200A\u202F]/g;

/**
 * Folds the forms that a reader sees as the same: curly and straight apostrophes, no-break and plain
 * spaces, and an accent typed as one character or as a letter and a mark (Unicode NFC). Smart punctuation
 * types "O’Brien" while the People screen may hold "O'Brien", and both must match.
 */
function fold(text: string): string {
  return text.normalize('NFC').replace(QUOTES, "'").replace(SPACES, ' ');
}

/** The folded text, with the place in the original text where each folded character starts and ends. */
function folded(text: string): { text: string; start: number[]; end: number[] } {
  let out = '';
  const start: number[] = [];
  const end: number[] = [];
  for (const m of text.matchAll(SEGMENT)) {
    const piece = fold(m[0]);
    // One entry for each UTF-16 unit of the folded piece.
    start.push(...new Array<number>(piece.length).fill(m.index));
    end.push(...new Array<number>(piece.length).fill(m.index + m[0].length));
    out += piece;
  }
  return { text: out, start, end };
}

export interface WordMatch {
  /** The place in the original text. */
  from: number;
  to: number;
  /** The index of the name in the list. */
  index: number;
}

/**
 * Whole-word matches of each name in `text`, in text order and without overlaps. An earlier name in the
 * list wins, so the list goes longest first. `free` can refuse a place, such as text that has a mark.
 */
export function matchNames(
  text: string,
  names: readonly string[],
  free: (from: number, to: number) => boolean = () => true,
): WordMatch[] {
  const f = folded(text);
  const taken: WordMatch[] = [];
  names.forEach((raw, index) => {
    const name = fold(raw.trim());
    if (name === '') return;
    let at = f.text.indexOf(name);
    while (at !== -1) {
      const last = at + name.length - 1;
      const from = f.start[at] ?? 0;
      const to = f.end[last] ?? from;
      const whole = !WORD.test(f.text[at - 1] ?? '') && !WORD.test(f.text[last + 1] ?? '');
      // A match starts and ends at the edges of whole characters.
      const edges = f.start[at - 1] !== from && f.end[last + 1] !== to;
      const open = taken.every((m) => to <= m.from || from >= m.to);
      if (whole && edges && open && free(from, to)) taken.push({ from, to, index });
      at = f.text.indexOf(name, at + 1);
    }
  });
  return taken.sort((a, b) => a.from - b.from);
}

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
    .filter((a) => a.name !== '' && fold(a.name) !== fold(a.alias))
    .sort((a, b) => fold(b.name).length - fold(a.name).length);
}

/** Every variant of every person as one alias list. */
export function aliasesOf(people: readonly PrivatePerson[]): Alias[] {
  return people.flatMap((person) => person.variants.map((v) => ({ name: v.real, alias: v.alias })));
}

function findMatches(text: string, aliases: readonly Alias[]): Match[] {
  return matchNames(
    text,
    aliases.map((a) => a.name),
  ).map((m) => {
    const alias = aliases[m.index] ?? { name: '', alias: '' };
    return { from: m.from, to: m.to, name: alias.name, alias: alias.alias };
  });
}

/** Builds the text with each match replaced. Plain joins, so a "$" in an alias stays a "$". */
function replaceIn(text: string, matches: readonly Match[]): string {
  let out = '';
  let at = 0;
  for (const m of matches) {
    out += text.slice(at, m.from) + m.alias;
    at = m.to;
  }
  return out + text.slice(at);
}

/** Replaces each name in a plain string. */
export function aliasText(text: string, aliases: readonly Alias[]): string {
  const list = prepare(aliases);
  if (list.length === 0) return text;
  return replaceIn(text, findMatches(text, list));
}

interface PersonNames {
  first: string;
  own: Alias[];
}

/** The people by id, each with its alias list ready for matching. */
interface Lookup {
  all: Alias[];
  byId: Map<string, PersonNames>;
}

function lookupOf(people: readonly PrivatePerson[]): Lookup {
  const byId = new Map<string, PersonNames>();
  for (const person of people) {
    const own = prepare(person.variants.map((v) => ({ name: v.real, alias: v.alias })));
    const first = person.variants.map((v) => v.alias.trim()).find((a) => a !== '');
    if (first !== undefined) byId.set(person.id, { first, own });
  }
  return { all: prepare(aliasesOf(people)), byId };
}

/**
 * The text that takes the place of a marked name. Each name of the person gives its own alias, and the
 * rest of the marked text stays, as in "Rosa’s". A name of another person in the marked text, as in a
 * mark on "Rosa and Teo", gives that person's alias too, and the check lists it. Marked text with no name
 * of the person in it, such as a name that the writer split, gives the person's first alias, so no part
 * of it shows.
 */
function markedAlias(
  text: string,
  person: PersonNames,
  all: readonly Alias[],
): { text: string; known: boolean; others: string[] } {
  const own = new Set(person.own.map((a) => a.name));
  const matches = findMatches(text, [...person.own, ...all.filter((a) => !own.has(a.name))]);
  if (!matches.some((m) => own.has(m.name))) return { text: person.first, known: false, others: [] };
  return {
    text: replaceIn(text, matches),
    known: true,
    others: matches.filter((m) => !own.has(m.name)).map((m) => m.name),
  };
}

/** The alias preview in the editor: the unmarked names in a text, and the alias of a marked name. */
export function namePreview(people: readonly PrivatePerson[]): {
  unmarked: (text: string) => Match[];
  marked: (text: string, personId: string) => string | null;
  has: (personId: string) => boolean;
} {
  const lookup = lookupOf(people);
  return {
    unmarked: (text) => findMatches(text, lookup.all),
    marked: (text, personId) => {
      const person = lookup.byId.get(personId);
      return person ? markedAlias(text, person, lookup.all).text : null;
    },
    has: (personId) => lookup.byId.has(personId),
  };
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

/** A copy of `run` with no person id, which no file format needs. */
function plain(run: TextRun, text: string = run.text): TextRun {
  return {
    type: 'text',
    text,
    style: run.style,
    ...(run.ai === undefined ? {} : { ai: run.ai }),
    ...(run.change === undefined ? {} : { change: run.change }),
    ...(run.comment === undefined ? {} : { comment: run.comment }),
  };
}

/**
 * Replaces names across runs of text. A name can cross from one run into the next, as in "Aunt *Rosa*",
 * so the runs are read as one text. The alias takes the style of the run where the name starts. `make`
 * gives a run with the style of `run` and new text.
 */
function aliasAcross<R extends { text: string }>(
  group: readonly R[],
  aliases: readonly Alias[],
  make: (run: R, text: string) => R,
): R[] {
  const text = group.map((r) => r.text).join('');
  const matches = findMatches(text, aliases);
  if (matches.length === 0) return group.map((r) => make(r, r.text));
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
  const pieces: R[] = [];
  const keep = (from: number, to: number) => {
    // The text between matches keeps the style of each run it came from.
    let at = from;
    while (at < to) {
      const index = runAt(at);
      const run = group[index];
      if (!run) break;
      const end = Math.min(to, (starts[index] ?? 0) + run.text.length);
      pieces.push(make(run, text.slice(at, end)));
      at = end;
    }
  };
  let pos = 0;
  for (const m of matches) {
    keep(pos, m.from);
    const run = group[runAt(m.from)];
    if (run && m.alias !== '') pieces.push(make(run, m.alias));
    pos = m.to;
  }
  keep(pos, text.length);
  return pieces.filter((p) => p.text !== '');
}

/** Joins runs of the same style, so an alias and the words around it make one run in each format. */
function joinRuns<R extends { text: string }>(runs: readonly R[]): R[] {
  const out: R[] = [];
  const styleOf = (run: R) => JSON.stringify({ ...run, text: '' });
  for (const run of runs) {
    const last = out[out.length - 1];
    if (last && styleOf(last) === styleOf(run)) last.text += run.text;
    else out.push({ ...run });
  }
  return out;
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/** The run without its link when the address holds a real name, as in https://example.org/Rosa. */
function safeLink(run: TextRun, aliases: readonly Alias[]): TextRun {
  const href = run.style.link;
  if (href === undefined) return run;
  const names = aliases.map((a) => a.name);
  // The parts of an address count as words, so "Rosa" is found in "/Rosa-letters" and "Rosa.html".
  const found = (value: string) => matchNames(value.replace(/[/?#=&._~+-]/g, ' '), names).length > 0;
  if (!found(href) && !found(safeDecode(href))) return run;
  const style = { ...run.style };
  delete style.link;
  return { ...run, style };
}

function aliasGroup(group: readonly TextRun[], lookup: Lookup): TextRun[] {
  return joinRuns(
    piecesOf(group, lookup).flatMap((piece) => {
      if (!piece.marked) return aliasAcross(piece.runs, lookup.all, (run, text) => plain(run, text));
      const person = lookup.byId.get(piece.person);
      const first = piece.runs[0];
      if (!person || !first) return [];
      const alias = markedAlias(piece.runs.map((r) => r.text).join(''), person, lookup.all).text;
      // An alias in place of AI words is still AI text on the provenance page.
      const ai = piece.runs.find((r) => r.ai !== undefined) ?? first;
      return alias === '' ? [] : [plain({ ...first, ...(ai.ai === undefined ? {} : { ai: ai.ai }) }, alias)];
    }),
  ).map((run) => safeLink(run, lookup.all));
}

interface RunHandlers {
  group: (group: TextRun[]) => TextRun[];
  note: (note: NoteContent) => NoteContent;
  latex: (latex: string) => string;
  /** Plain text with no marks, such as the alt text and the caption of an image. */
  text: (text: string) => string;
}

/** Calls the handlers for each line of text runs, each note and each equation. */
function mapRuns(runs: readonly Run[], on: RunHandlers): Run[] {
  const out: Run[] = [];
  let group: TextRun[] = [];
  const flush = () => {
    if (group.length > 0) out.push(...on.group(group));
    group = [];
  };
  const struck = (run: TextRun | undefined) => run?.change?.kind === 'delete';
  for (const run of runs) {
    if (run.type === 'text') {
      // Deleted words and the words that take their place are two texts, so a name in each is found.
      if (group.length > 0 && struck(group[group.length - 1]) !== struck(run)) flush();
      group.push(run);
      continue;
    }
    flush();
    if (run.type === 'footnote') out.push({ ...run, note: on.note(run.note) });
    else if (run.type === 'math') out.push({ ...run, latex: on.latex(run.latex) });
    else out.push(run);
  }
  flush();
  return out;
}

function mapBlocks(blocks: readonly Block[], on: RunHandlers): Block[] {
  return blocks.map((block): Block => {
    switch (block.type) {
      case 'paragraph':
      case 'heading':
        return { ...block, runs: mapRuns(block.runs, on) };
      case 'list':
        return { ...block, items: block.items.map((item) => mapBlocks(item, on)) };
      case 'quote':
        return { ...block, blocks: mapBlocks(block.blocks, on) };
      case 'stanza':
        return { ...block, lines: block.lines.map((line) => ({ ...line, runs: mapRuns(line.runs, on) })) };
      case 'math':
        return { ...block, latex: on.latex(block.latex) };
      case 'image':
        // The alt text and the caption are text of the export, so a name in them gets its alias.
        return { ...block, alt: on.text(block.alt), caption: on.text(block.caption) };
      default:
        return block;
    }
  });
}

/** The export with each private name replaced by its alias, when `on` is true. */
export function shareSafe(doc: ExportDoc, people: readonly PrivatePerson[], on: boolean): ExportDoc {
  const lookup = lookupOf(people);
  if (!on || lookup.all.length === 0) return doc;
  const handlers: RunHandlers = {
    // A comment that a Word export keeps (F45) gets the aliases in its text too.
    group: (group) =>
      aliasGroup(group, lookup).map((run) =>
        run.comment
          ? { ...run, comment: { ...run.comment, text: aliasText(run.comment.text, lookup.all) } }
          : run,
      ),
    // A note's runs are read as one text too, so a name in two styles is still found.
    note: (note) => joinRuns(aliasAcross(note, lookup.all, (run, text) => ({ ...run, text }))),
    latex: (latex) => aliasText(latex, lookup.all),
    text: (text) => aliasText(text, lookup.all),
  };
  const book = doc.book;
  return {
    ...doc,
    title: aliasText(doc.title, lookup.all),
    sections: doc.sections.map((section) => ({
      ...section,
      title: aliasText(section.title, lookup.all),
      blocks: mapBlocks(section.blocks, handlers),
    })),
    ...(book && {
      book: {
        ...book,
        ...Object.fromEntries(BOOK_TEXTS.map((key) => [key, aliasText(book[key], lookup.all)])),
      },
    }),
  };
}

export interface NameCount {
  name: string;
  count: number;
}

/** What the check before a share-safe export found in the text. */
export interface NameCheck {
  /** Real names in the text with no mark of their own, longest first. The export still swaps each. */
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
 * The unmarked real names and the changed marked names in the text of an export. Titles, notes and
 * equations have no marks, so the check reads only the text, where "Mark all" can add a mark.
 */
export function nameCheck(doc: ExportDoc, people: readonly PrivatePerson[]): NameCheck {
  const lookup = lookupOf(people);
  const unmarked = new Map<string, number>();
  const changed = new Map<string, number>();
  if (lookup.all.length === 0) return { unmarked: [], changed: [] };
  const add = (counts: Map<string, number>, name: string) => {
    counts.set(name, (counts.get(name) ?? 0) + 1);
  };
  // A comment spans runs, so each comment is read once.
  const comments = new Set<string>();
  const handlers: RunHandlers = {
    group: (group) => {
      for (const run of group) {
        if (!run.comment || comments.has(run.comment.id)) continue;
        comments.add(run.comment.id);
        for (const m of findMatches(run.comment.text, lookup.all)) add(unmarked, m.name);
      }
      for (const piece of piecesOf(group, lookup)) {
        const text = piece.runs.map((r) => r.text).join('');
        if (!piece.marked) {
          for (const m of findMatches(text, lookup.all)) add(unmarked, m.name);
          continue;
        }
        const person = lookup.byId.get(piece.person);
        if (!person) continue;
        const result = markedAlias(text, person, lookup.all);
        if (!result.known) add(changed, text);
        for (const name of result.others) add(unmarked, name);
      }
      return group;
    },
    note: (note) => note,
    latex: (latex) => latex,
    // The alt text and the caption of an image have no marks, but the export swaps a name in them.
    text: (text) => {
      for (const m of findMatches(text, lookup.all)) add(unmarked, m.name);
      return text;
    },
  };
  for (const section of doc.sections) {
    // Headings at levels 1 and 2 are folder and item titles, not text.
    mapBlocks(
      section.blocks.filter((b) => b.type !== 'heading' || b.level > 2),
      handlers,
    );
  }
  for (const key of BOOK_TEXTS) {
    for (const m of findMatches(doc.book?.[key] ?? '', lookup.all)) add(unmarked, m.name);
  }
  return { unmarked: counted(unmarked, true), changed: counted(changed, false) };
}
