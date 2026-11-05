/*
 * The Craft panel's scan (spec 8.3, plan Task C7, F19). Pure functions, so the worker and the tests share
 * them. Each line gets a syllable count, a stress mark for each syllable and a rhyme letter.
 *
 * - Syllables and stress come from the CMU dictionary. A word that the dictionary lacks gets its syllable
 *   count from the `syllable` package and no stress mark, because a guess would mislead.
 * - CMU stress digits: 1 is stressed and 0 is unstressed in a word of two or more syllables. A one-syllable
 *   word and a secondary stress (2) can go either way in a line, so a meter that fits the fixed stresses
 *   chooses them. With no meter, a small word such as "the" or "to" is unstressed and the rest stressed.
 * - Two lines rhyme when the phones of their last words match from the last stressed vowel to the end.
 */

export type Stress = 's' | 'u';
export type Meter = 'iambic' | 'trochaic' | 'anapestic' | 'dactylic';

export interface WordScan {
  /** The word as written, and its place in the line. */
  text: string;
  from: number;
  to: number;
  /** One entry for each syllable. Null for a word that the dictionary lacks. */
  stresses: (Stress | null)[];
  known: boolean;
}

export interface LineScan {
  syllables: number;
  words: WordScan[];
  /** The meter that fits the line, if any. */
  meter: Meter | null;
  /** "A", "B" and so on. Null for a blank line. */
  rhyme: string | null;
}

/** The two sources of the scan, ready for lookups. */
export interface Lexicon {
  /** Each pronunciation of the word as a list of phones, or null when the dictionary lacks it. */
  phones: (word: string) => string[][] | null;
  /** The syllable count of a word that the dictionary lacks. */
  count: (word: string) => number;
}

/** Builds the lexicon from the CMU dictionary object and the `syllable` function. */
export function lexiconOf(
  dictionary: Readonly<Record<string, string>>,
  syllable: (word: string) => number,
): Lexicon {
  return {
    phones: (word) => {
      const first = dictionary[word];
      if (first === undefined) return null;
      const all = [first];
      for (let n = 2; ; n += 1) {
        const next = dictionary[`${word}(${String(n)})`];
        if (next === undefined) break;
        all.push(next);
      }
      return all.map((p) => p.split(' '));
    },
    count: syllable,
  };
}

/** A word: letters and digits, with apostrophes inside it ("summer's") or before it ("’tis"). */
const WORD = /['‘’]?[\p{L}\p{N}]+(?:['’]\p{L}+)*/gu;
const QUOTE = /^['‘’]/;
const VOWEL = /\d$/;

/**
 * Small words that a line can leave unstressed: articles, pronouns, prepositions, conjunctions and
 * helping verbs. Each is one syllable.
 */
const LIGHT = new Set(
  (
    'a an the and but or nor for so yet as at by in of on to up with from than that this these those ' +
    'i me my thee thou thy you your he him his she her it its we us our they them their who whom whose ' +
    'is am are was were be been has have had do does did shall should will would can could may might ' +
    'must not if then when while where there here o oh'
  ).split(' '),
);

const METERS: { meter: Meter; foot: Stress[] }[] = [
  { meter: 'iambic', foot: ['u', 's'] },
  { meter: 'trochaic', foot: ['s', 'u'] },
  { meter: 'anapestic', foot: ['u', 'u', 's'] },
  { meter: 'dactylic', foot: ['s', 'u', 'u'] },
];

/** A line shorter than this has too few syllables to show a meter. */
const MIN_METER = 4;

function folded(word: string): string {
  return word.toLowerCase().replace(/[‘’]/g, "'");
}

interface Syllable {
  /** The stress that the word itself fixes, or null when the line chooses. */
  fixed: Stress | null;
  /** The stress with no meter. Null for a word that the dictionary lacks. */
  plain: Stress | null;
}

interface Looked {
  word: WordScan;
  syllables: Syllable[];
  /** The rhyme keys of the word, one for each pronunciation. */
  keys: string[];
}

function rhymeKey(phones: readonly string[]): string {
  const vowels = phones.flatMap((p, i) => (VOWEL.test(p) ? [i] : []));
  const stressed = vowels.filter((i) => !(phones[i] ?? '').endsWith('0'));
  const from = stressed.at(-1) ?? vowels.at(-1) ?? 0;
  return phones
    .slice(from)
    .map((p) => p.replace(/\d$/, ''))
    .join(' ');
}

/** The ending of a word that the dictionary lacks: its last group of vowels and what follows. */
function spellingKey(word: string): string {
  const match = /[aeiouy]+[^aeiouy]*$/.exec(word);
  return `~${match ? match[0] : word}`;
}

function lookUp(text: string, from: number, lexicon: Lexicon): Looked {
  let word = folded(text);
  let start = from;
  let shown = text;
  let found = lexicon.phones(word);
  // A quote mark before a word is not part of it, unless the dictionary has the word with it ("’tis").
  if (!found && QUOTE.test(word)) {
    word = word.slice(1);
    start += 1;
    shown = text.slice(1);
    found = lexicon.phones(word);
  }
  const to = start + shown.length;
  const pron = found?.[0];
  if (!found || !pron) {
    const n = Math.max(0, lexicon.count(word));
    return {
      word: { text: shown, from: start, to, stresses: new Array<null>(n).fill(null), known: false },
      syllables: new Array<Syllable>(n).fill({ fixed: null, plain: null }),
      keys: [spellingKey(word)],
    };
  }
  const digits = pron.filter((p) => VOWEL.test(p)).map((p) => p.slice(-1));
  const one = digits.length === 1;
  const syllables = digits.map((d): Syllable => {
    if (one) return { fixed: null, plain: LIGHT.has(word) || d === '0' ? 'u' : 's' };
    if (d === '1') return { fixed: 's', plain: 's' };
    if (d === '0') return { fixed: 'u', plain: 'u' };
    return { fixed: null, plain: 's' };
  });
  return {
    word: { text: shown, from: start, to, stresses: syllables.map((s) => s.plain), known: true },
    syllables,
    keys: [...new Set(found.map(rhymeKey))],
  };
}

/** The meter whose feet fit every fixed stress, with the most plain stresses in agreement. */
function fitMeter(syllables: readonly Syllable[]): { meter: Meter; foot: Stress[] } | null {
  if (syllables.length < MIN_METER) return null;
  let best: { meter: Meter; foot: Stress[] } | null = null;
  let bestScore = -Infinity;
  for (const candidate of METERS) {
    const { foot } = candidate;
    // A three-syllable foot fits more lines by chance, so it needs one more agreement to win.
    let score = foot.length === 3 ? -1 : 0;
    const fits = syllables.every((s, i) => {
      const want = foot[i % foot.length];
      if (s.fixed === null && s.plain === want) score += 1;
      return s.fixed === null || s.fixed === want;
    });
    if (fits && score > bestScore) {
      best = candidate;
      bestScore = score;
    }
  }
  return best;
}

/** "A" to "Z", then "AA", "AB" and so on. */
function letterOf(index: number): string {
  let n = index;
  let out = '';
  do {
    out = String.fromCharCode(65 + (n % 26)) + out;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return out;
}

/** Scans each line of a poem. A line that rhymes with an earlier line gets that line's letter. */
export function scanLines(lines: readonly string[], lexicon: Lexicon): LineScan[] {
  const groups: Set<string>[] = [];
  return lines.map((line): LineScan => {
    const looked = [...line.matchAll(WORD)].map((m) => lookUp(m[0], m.index, lexicon));
    if (looked.length === 0) return { syllables: 0, words: [], meter: null, rhyme: null };
    const syllables = looked.flatMap((l) => l.syllables);
    const fit = fitMeter(syllables);
    const words = looked.map((l) => l.word);
    if (fit) {
      // The meter chooses each open stress. A word that the dictionary lacks keeps no mark.
      let i = 0;
      for (const l of looked) {
        l.word.stresses = l.syllables.map((s) => {
          const want = fit.foot[i % fit.foot.length] ?? 'u';
          i += 1;
          return l.word.known ? (s.fixed ?? want) : null;
        });
      }
    }
    const keys = looked.at(-1)?.keys ?? [];
    let group = groups.findIndex((g) => keys.some((k) => g.has(k)));
    if (group === -1) {
      groups.push(new Set(keys));
      group = groups.length - 1;
    }
    return { syllables: syllables.length, words, meter: fit?.meter ?? null, rhyme: letterOf(group) };
  });
}
