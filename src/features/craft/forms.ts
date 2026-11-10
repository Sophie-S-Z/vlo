import type { LineScan } from './scan';

/*
 * The poetry form check (roadmap F56, plan Task K1). Pure, so the tests and the Craft labels share it. It
 * reads the poem's stanzas and, in English, the Craft scan of each line. Line and stanza counts, refrains
 * and end words work in every language. Rhyme, syllables and meter need the scan, so they are English only.
 */

export type PoemForm = 'sonnet' | 'villanelle' | 'ghazal' | 'haiku' | 'pantoum' | 'sestina';

export const POEM_FORMS: readonly { id: PoemForm; name: string }[] = [
  { id: 'sonnet', name: 'Sonnet' },
  { id: 'villanelle', name: 'Villanelle' },
  { id: 'ghazal', name: 'Ghazal' },
  { id: 'haiku', name: 'Haiku' },
  { id: 'pantoum', name: 'Pantoum' },
  { id: 'sestina', name: 'Sestina' },
];

export function isPoemForm(value: unknown): value is PoemForm {
  return POEM_FORMS.some((f) => f.id === value);
}

export type FormNoteKind = 'count' | 'rhyme' | 'refrain' | 'endword' | 'syllables' | 'meter';

export interface FormNote {
  /** The line of the note, counted from 0 over the whole poem, or null for the whole poem. */
  line: number | null;
  kind: FormNoteKind;
  message: string;
}

const WORD = /[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu;

/** The words of a line in lower case, with no punctuation, so a refrain matches with other marks. */
function wordsOf(line: string): string[] {
  return [...line.toLowerCase().replace(/’/g, "'").matchAll(WORD)].map((m) => m[0]);
}

const same = (a: string, b: string) => wordsOf(a).join(' ') === wordsOf(b).join(' ');
const lineName = (index: number) => `Line ${String(index + 1)}`;

/** The stanzas as lists of line numbers. One stanza of the whole poem is cut into the form's sizes. */
function stanzasOf(stanzas: readonly (readonly string[])[], sizes: (index: number) => number): number[][] {
  const out: number[][] = [];
  let next = 0;
  if (stanzas.length > 1) {
    for (const stanza of stanzas) {
      out.push(stanza.map((_, k) => next + k));
      next += stanza.length;
    }
    return out;
  }
  const total = stanzas[0]?.length ?? 0;
  while (next < total) {
    const size = Math.min(sizes(out.length), total - next);
    out.push(Array.from({ length: size }, (_, k) => next + k));
    next += size;
  }
  return out;
}

function countNote(form: string, want: number, have: number): FormNote[] {
  if (want === have) return [];
  return [
    {
      line: null,
      kind: 'count',
      message: `A ${form} has ${String(want)} lines. This poem has ${String(have)}.`,
    },
  ];
}

function stanzaNotes(form: string, groups: readonly number[][], want: (index: number) => number): FormNote[] {
  return groups.flatMap((group, index) => {
    const size = want(index);
    if (group.length === size || group[0] === undefined) return [];
    return [
      {
        line: group[0],
        kind: 'count' as const,
        message: `Stanza ${String(index + 1)} has ${String(group.length)} lines. This ${form} stanza has ${String(size)}.`,
      },
    ];
  });
}

/** One note for each line of a group that does not rhyme with the group's first line. */
function rhymeNotes(groups: readonly number[][], scans: readonly LineScan[]): FormNote[] {
  return groups.flatMap(([first, ...rest]) => {
    if (first === undefined) return [];
    const letter = scans[first]?.rhyme;
    return rest
      .filter((line) => scans[line]?.rhyme !== letter)
      .map((line) => ({
        line,
        kind: 'rhyme' as const,
        message: `${lineName(line)} does not rhyme with line ${String(first + 1)}.`,
      }));
  });
}

/** The rhyme notes of the scheme that fits best. */
function bestRhyme(schemes: readonly number[][][], scans: readonly LineScan[]): FormNote[] {
  let best: FormNote[] | null = null;
  for (const scheme of schemes) {
    const notes = rhymeNotes(scheme, scans);
    if (!best || notes.length < best.length) best = notes;
  }
  return best ?? [];
}

function refrainNotes(lines: readonly string[], pairs: readonly [number, number][]): FormNote[] {
  return pairs.flatMap(([source, line]) => {
    const a = lines[source];
    const b = lines[line];
    if (a === undefined || b === undefined || same(a, b)) return [];
    return [
      {
        line,
        kind: 'refrain' as const,
        message: `${lineName(line)} should repeat line ${String(source + 1)}.`,
      },
    ];
  });
}

/** The most common value, or null when no value comes in at least half of the list. */
function majority<T>(values: readonly T[]): T | null {
  const counts = new Map<T, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  let best: T | null = null;
  let most = 0;
  for (const [v, n] of counts) {
    if (n > most) {
      best = v;
      most = n;
    }
  }
  return most * 2 >= values.length ? best : null;
}

/** A line is this many syllables from the poem's usual length before it gets a note. */
const SYLLABLE_SLACK = 2;

/**
 * Meter drift: a line far from the measure of the poem. The form sets the measure, or else the syllable
 * count of most lines does. The per-line meter of the scan is not used, because a poet often turns a
 * foot, as Shakespeare does, and that is not drift.
 */
function driftNotes(scans: readonly LineScan[], measure?: number): FormNote[] {
  const lines = scans.map((scan, line) => ({ scan, line })).filter((l) => l.scan.syllables > 0);
  const syllables = measure ?? majority(lines.map((l) => l.scan.syllables));
  if (syllables === null) return [];
  return lines.flatMap(({ scan, line }): FormNote[] =>
    Math.abs(scan.syllables - syllables) > SYLLABLE_SLACK
      ? [
          {
            line,
            kind: 'meter',
            message: `${lineName(line)} has ${String(scan.syllables)} syllables. The measure is ${String(syllables)}.`,
          },
        ]
      : [],
  );
}

const range = (from: number, to: number) => Array.from({ length: to - from }, (_, k) => from + k);

function sonnet(lines: readonly string[], scans: readonly LineScan[] | null): FormNote[] {
  const notes = countNote('sonnet', 14, lines.length);
  if (notes.length > 0 || !scans) return notes;
  const shakespearean = [
    [0, 2],
    [1, 3],
    [4, 6],
    [5, 7],
    [8, 10],
    [9, 11],
    [12, 13],
  ];
  const octave = [
    [0, 3, 4, 7],
    [1, 2, 5, 6],
  ];
  const petrarchan = [
    [...octave, [8, 11], [9, 12], [10, 13]],
    [...octave, [8, 10, 12], [9, 11, 13]],
  ];
  return [...bestRhyme([shakespearean, ...petrarchan], scans), ...driftNotes(scans, 10)];
}

function villanelle(
  stanzas: readonly (readonly string[])[],
  lines: readonly string[],
  scans: readonly LineScan[] | null,
): FormNote[] {
  const notes = countNote('villanelle', 19, lines.length);
  if (notes.length > 0) return notes;
  const size = (index: number) => (index === 5 ? 4 : 3);
  notes.push(...stanzaNotes('villanelle', stanzasOf(stanzas, size), size));
  notes.push(
    ...refrainNotes(lines, [
      [0, 5],
      [0, 11],
      [0, 17],
      [2, 8],
      [2, 14],
      [2, 18],
    ]),
  );
  if (!scans) return notes;
  const a = [0, 2, 3, 5, 6, 8, 9, 11, 12, 14, 15, 17, 18];
  const b = [1, 4, 7, 10, 13, 16];
  return [...notes, ...rhymeNotes([a, b], scans), ...driftNotes(scans)];
}

function pantoum(
  stanzas: readonly (readonly string[])[],
  lines: readonly string[],
  scans: readonly LineScan[] | null,
): FormNote[] {
  const groups = stanzasOf(stanzas, () => 4);
  if (groups.length < 2) {
    return [{ line: null, kind: 'count', message: 'A pantoum has two or more stanzas of 4 lines.' }];
  }
  const notes = stanzaNotes('pantoum', groups, () => 4);
  // Lines 2 and 4 of each stanza come back as lines 1 and 3 of the next.
  for (let s = 1; s < groups.length; s += 1) {
    const before = groups[s - 1] ?? [];
    const now = groups[s] ?? [];
    const pairs: [number, number][] = [];
    if (before[1] !== undefined && now[0] !== undefined) pairs.push([before[1], now[0]]);
    if (before[3] !== undefined && now[2] !== undefined) pairs.push([before[3], now[2]]);
    notes.push(...refrainNotes(lines, pairs));
  }
  return scans ? [...notes, ...driftNotes(scans)] : notes;
}

/**
 * True for the same end word, or a longer form of it, such as "along" for "long". The shorter word has
 * 3 letters or more, so "a" is not a form of "sea".
 */
function sameWord(a: string, b: string): boolean {
  if (a === b) return a !== '';
  return Math.min(a.length, b.length) >= 3 && (a.endsWith(b) || b.endsWith(a));
}

const endsWith = (line: string, word: string) => sameWord(wordsOf(line).at(-1) ?? '', word);

/** The order of the end words in each stanza: the last, the first, the fifth, the second, and so on. */
const SESTINA_TURN = [5, 0, 4, 1, 3, 2];

function sestina(
  stanzas: readonly (readonly string[])[],
  lines: readonly string[],
  scans: readonly LineScan[] | null,
): FormNote[] {
  const notes = countNote('sestina', 39, lines.length);
  if (notes.length > 0) return notes;
  const size = (index: number) => (index === 6 ? 3 : 6);
  const groups = stanzasOf(stanzas, size);
  notes.push(...stanzaNotes('sestina', groups, size));
  if (notes.length > 0) return notes;
  let order = range(0, 6).map((k) => wordsOf(lines[k] ?? '').at(-1) ?? '');
  // A first-stanza line with no word gives no end word to check.
  const words = order.filter((w) => w !== '');
  for (let s = 1; s < 6; s += 1) {
    order = SESTINA_TURN.map((k) => order[k] ?? '');
    (groups[s] ?? []).forEach((line, k) => {
      const want = order[k] ?? '';
      if (want === '' || endsWith(lines[line] ?? '', want)) return;
      notes.push({
        line,
        kind: 'endword',
        message: `${lineName(line)} should end with “${want}” (stanza ${String(s + 1)}).`,
      });
    });
  }
  // The envoi holds all six end words, and each of its lines ends with one of them.
  const envoi = groups[6] ?? [];
  const envoiWords = envoi.flatMap((line) => wordsOf(lines[line] ?? ''));
  for (const line of envoi) {
    if (!words.some((w) => endsWith(lines[line] ?? '', w))) {
      notes.push({
        line,
        kind: 'endword',
        message: `${lineName(line)} should end with one of the six end words.`,
      });
    }
  }
  const missing = words.filter((w) => !envoiWords.some((e) => sameWord(e, w)));
  if (missing.length > 0 && envoi[0] !== undefined) {
    notes.push({
      line: envoi[0],
      kind: 'endword',
      message: `The envoi does not have ${missing.map((w) => `“${w}”`).join(', ')}.`,
    });
  }
  return scans ? [...notes, ...driftNotes(scans)] : notes;
}

/** The words at the end of both lines, which are the ghazal's refrain (radif). */
function sharedEnd(a: string, b: string): string[] {
  const x = wordsOf(a);
  const y = wordsOf(b);
  const out: string[] = [];
  while (x.length > 0 && x.at(-1) === y.at(-1)) {
    out.unshift(x.pop() ?? '');
    y.pop();
  }
  return out;
}

function ghazal(stanzas: readonly (readonly string[])[], lines: readonly string[]): FormNote[] {
  const groups = stanzasOf(stanzas, () => 2);
  const notes = stanzaNotes('ghazal', groups, () => 2);
  if (groups.length < 5) {
    notes.unshift({
      line: null,
      kind: 'count',
      message: `A ghazal has 5 or more couplets. This poem has ${String(groups.length)}.`,
    });
  }
  const [first, second] = groups[0] ?? [];
  if (first === undefined || second === undefined) return notes;
  const refrain = sharedEnd(lines[first] ?? '', lines[second] ?? '');
  if (refrain.length === 0) {
    notes.push({
      line: second,
      kind: 'refrain',
      message: 'Both lines of the first couplet should end with the same refrain.',
    });
    return notes;
  }
  const words = refrain.join(' ');
  for (const [index, group] of groups.entries()) {
    const line = group[1];
    if (index === 0 || line === undefined) continue;
    if (
      wordsOf(lines[line] ?? '')
        .slice(-refrain.length)
        .join(' ') === words
    )
      continue;
    notes.push({
      line,
      kind: 'refrain',
      message: `${lineName(line)} should end with the refrain “${words}”.`,
    });
  }
  return notes;
}

const HAIKU = [5, 7, 5];

function haiku(lines: readonly string[], scans: readonly LineScan[] | null): FormNote[] {
  const notes = countNote('haiku', 3, lines.length);
  if (notes.length > 0 || !scans) return notes;
  return HAIKU.flatMap((want, line): FormNote[] => {
    const have = scans[line]?.syllables ?? 0;
    if (have === want) return [];
    return [
      {
        line,
        kind: 'syllables',
        message: `${lineName(line)} has ${String(have)} syllables. A haiku line ${String(line + 1)} has ${String(want)}.`,
      },
    ];
  });
}

/**
 * Checks a poem against a form. `stanzas` holds the text of each line, stanza by stanza. `scans` is the
 * Craft scan of each line in the same order, or null when the poem is not in English.
 */
export function checkForm(
  form: PoemForm,
  stanzas: readonly (readonly string[])[],
  scans: readonly LineScan[] | null,
): FormNote[] {
  const lines = stanzas.flat();
  switch (form) {
    case 'sonnet':
      return sonnet(lines, scans);
    case 'villanelle':
      return villanelle(stanzas, lines, scans);
    case 'pantoum':
      return pantoum(stanzas, lines, scans);
    case 'sestina':
      return sestina(stanzas, lines, scans);
    case 'ghazal':
      return ghazal(stanzas, lines);
    case 'haiku':
      return haiku(lines, scans);
  }
}
