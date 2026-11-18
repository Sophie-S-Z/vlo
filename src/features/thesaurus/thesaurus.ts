import { rhymeKey } from '@/features/craft/scan';

/*
 * The thesaurus and the rhymes (Phase 19, Task D2). Pure functions, so the worker and the tests share them.
 * The data comes from scripts/build-thesaurus.mjs, which reads Open English WordNet: each sense once, with
 * its part of speech, a short definition and its words, and each word with its senses and antonyms.
 */

/** One sense of a word: the sense's place in `senses`, and the word's antonyms in that sense. */
type Row = [number] | [number, string[]];

/** The file that scripts/build-thesaurus.mjs writes. */
export interface ThesaurusData {
  credit: string;
  /** [part of speech, short definition, words]. */
  senses: [string, string, string[]][];
  /** Each word's senses, the most common first. */
  words: Record<string, Row[]>;
  /** The words whose most common sense is obscene. The rhymes leave them out. */
  rude: string[];
}

export interface Sense {
  /** "noun", "verb", "adjective" or "adverb". */
  pos: string;
  definition: string;
  /** The other words of the sense, without the word itself. */
  words: string[];
  antonyms: string[];
}

export interface ThesaurusEntry {
  /** The word that the thesaurus lists, such as "bright" for "brighter". */
  word: string;
  senses: Sense[];
}

export interface Rhyme {
  word: string;
  syllables: number;
}

export interface Rhymes {
  word: string;
  syllables: number;
  /** The same sounds from the last stressed vowel to the end, such as "night" for "light". */
  perfect: Rhyme[];
  /** The same stressed vowel and as many sounds after it, such as "life" for "light". */
  near: Rhyme[];
}

/** The most rhymes of each kind. */
const MAX_RHYMES = 60;

/** WordNet writes an apostrophe as ’, and its words are in lower case. */
export function fold(word: string): string {
  return word.trim().toLowerCase().replace(/['‘]/g, '’');
}

/**
 * The forms that a word can come from, the word first: "brighter" can be "brighter", "brighte" or
 * "bright". The endings are WordNet's own rules for plurals, verb forms and comparisons.
 */
export function baseForms(word: string): string[] {
  const folded = fold(word).replace(/’s$/, '');
  const forms = [folded];
  for (const [ending, base] of ENDINGS) {
    if (!folded.endsWith(ending) || folded.length <= ending.length + 1) continue;
    const stem = folded.slice(0, -ending.length) + base;
    forms.push(stem);
    // "running" is "runn" and then "run".
    if (base === '' && /([b-df-hj-np-tv-z])\1$/.test(stem)) forms.push(stem.slice(0, -1));
  }
  return [...new Set(forms)];
}

const ENDINGS: readonly [string, string][] = [
  ['ies', 'y'],
  ['ses', 's'],
  ['xes', 'x'],
  ['zes', 'z'],
  ['ches', 'ch'],
  ['shes', 'sh'],
  ['es', 'e'],
  ['s', ''],
  ['ied', 'y'],
  ['ed', 'e'],
  ['ed', ''],
  ['ing', 'e'],
  ['ing', ''],
  ['ier', 'y'],
  ['iest', 'y'],
  ['er', 'e'],
  ['er', ''],
  ['est', 'e'],
  ['est', ''],
];

function rowsOf(data: ThesaurusData, word: string): Row[] | undefined {
  // "constructor" and the like are words too, not the object's own keys.
  return Object.hasOwn(data.words, word) ? data.words[word] : undefined;
}

/** The senses of the word, or of the first form that it comes from. Null when WordNet lacks it. */
export function lookUp(data: ThesaurusData, word: string): ThesaurusEntry | null {
  for (const form of baseForms(word)) {
    const rows = rowsOf(data, form);
    if (!rows) continue;
    return {
      word: form,
      senses: rows.flatMap(([index, antonyms]) => {
        const sense = data.senses[index];
        if (!sense) return [];
        const [pos, definition, words] = sense;
        return [{ pos, definition, words: words.filter((w) => w !== form), antonyms: antonyms ?? [] }];
      }),
    };
  }
  return null;
}

/** The replacement in the case of the word that it replaces: "Bright" gets "Brilliant", "BRIGHT" "BRILLIANT". */
export function inCaseOf(original: string, replacement: string): string {
  const letters = original.replace(/[^\p{L}]/gu, '');
  if (letters.length > 1 && letters === letters.toUpperCase() && letters !== letters.toLowerCase())
    return replacement.toUpperCase();
  const first = original.charAt(0);
  if (first !== first.toLowerCase()) return replacement.charAt(0).toUpperCase() + replacement.slice(1);
  return replacement;
}

const VOWEL = /\d$/;

interface Sound {
  key: string;
  /** The stressed vowel and the number of sounds after it, such as "AY 2" for "light". */
  shape: string;
  syllables: number;
}

/** The rhymes of every word in the thesaurus, grouped by their sounds. */
export interface RhymeIndex {
  sounds: (word: string) => Sound[];
  byKey: Map<string, string[]>;
  byShape: Map<string, string[]>;
  syllables: Map<string, number>;
}

function soundOf(phones: string[]): Sound {
  const key = rhymeKey(phones);
  const parts = key.split(' ');
  return {
    key,
    shape: `${parts[0] ?? ''} ${String(parts.length)}`,
    syllables: phones.filter((p) => VOWEL.test(p)).length,
  };
}

function add(map: Map<string, string[]>, key: string, word: string) {
  const list = map.get(key);
  if (list) list.push(word);
  else map.set(key, [word]);
}

/**
 * Builds the rhyme index from the CMU dictionary. Only the words of the thesaurus count, so the rhymes
 * leave out names, spellings that are not words, and obscene words. A word with more senses is usually
 * more common, so it comes first.
 */
export function rhymeIndex(dictionary: Readonly<Record<string, string>>, data: ThesaurusData): RhymeIndex {
  const sounds = (word: string): Sound[] => {
    const plain = word.toLowerCase().replace(/[‘’]/g, "'");
    const all: Sound[] = [];
    for (let n = 1; ; n += 1) {
      const phones = dictionary[n === 1 ? plain : `${plain}(${String(n)})`];
      if (phones === undefined) break;
      all.push(soundOf(phones.split(' ')));
    }
    return all;
  };
  const rude = new Set(data.rude);
  const ranked = Object.keys(data.words)
    .filter((w) => !rude.has(w))
    .sort((a, b) => (data.words[b]?.length ?? 0) - (data.words[a]?.length ?? 0) || (a < b ? -1 : 1));
  const byKey = new Map<string, string[]>();
  const byShape = new Map<string, string[]>();
  const syllables = new Map<string, number>();
  for (const word of ranked) {
    const found = sounds(word);
    const first = found[0];
    if (!first) continue;
    syllables.set(word, first.syllables);
    for (const key of new Set(found.map((s) => s.key))) add(byKey, key, word);
    for (const shape of new Set(found.map((s) => s.shape))) add(byShape, shape, word);
  }
  return { sounds, byKey, byShape, syllables };
}

/** The perfect and near rhymes of a word. Null when the dictionary has no pronunciation for it. */
export function rhymesFor(index: RhymeIndex, word: string): Rhymes | null {
  const plain = fold(word).replace(/’/g, "'");
  const found = index.sounds(plain);
  const first = found[0];
  if (!first) return null;
  const self = fold(word);
  const perfect = new Set<string>();
  for (const sound of found) for (const w of index.byKey.get(sound.key) ?? []) if (w !== self) perfect.add(w);
  // A near rhyme that ends in the same sound, such as "kite" and "lights", comes first.
  const ends = new Set(found.map((s) => s.key.split(' ').at(-1)));
  const near = new Set<string>();
  const later: string[] = [];
  for (const sound of found)
    for (const w of index.byShape.get(sound.shape) ?? []) {
      if (w === self || perfect.has(w)) continue;
      if (index.sounds(w).some((s) => ends.has(s.key.split(' ').at(-1)))) near.add(w);
      else later.push(w);
    }
  for (const w of later) near.add(w);
  // The fewest syllables first, as a rhyming dictionary lists them. Sort is stable, so each group keeps
  // the most common words first.
  const list = (set: Set<string>): Rhyme[] =>
    [...set]
      .map((w) => ({ word: w, syllables: index.syllables.get(w) ?? 0 }))
      .sort((a, b) => a.syllables - b.syllables)
      .slice(0, MAX_RHYMES);
  return { word: self, syllables: first.syllables, perfect: list(perfect), near: list(near) };
}
