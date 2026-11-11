import { countWords } from '@/lib/wordcount';
import { deviation, mean, sentencesOf, wordsOf, type Sentence } from './text';
import type { EditorForm } from '@/features/library/templates';

/*
 * Text statistics, as word-count sites show them: counts, times, sentence and word measures, readability
 * scores and keyword density. Pure functions, so the analysis worker and the tests share them. The
 * syllable counter comes in as a parameter, so this file loads no package.
 */

/** Silent reading speed for prose, in words a minute. */
export const READING_WPM = 238;
/** Speaking speed for a reading out loud, in words a minute. */
export const SPEAKING_WPM = 150;
/** Handwriting speed, in words a minute. */
export const HANDWRITING_WPM = 13;
/** Typing speed of an average typist, in words a minute. */
export const TYPING_WPM = 40;
/** Words on a page: single-spaced and double-spaced, 12 pt type, 1 inch margins. */
export const WORDS_PER_PAGE = { single: 500, double: 250 } as const;
/** A sentence with more words than this is long. */
export const LONG_SENTENCE = 25;

export type CountSyllables = (word: string) => number;

export interface SentenceNote {
  from: number;
  to: number;
  words: number;
  text: string;
}

export interface Keyword {
  phrase: string;
  count: number;
  /** The share of all words, as a percent. For a phrase, each occurrence counts its own words. */
  density: number;
}

export interface Readability {
  /** 0 to 100. Higher is easier. 60 to 70 is plain English. */
  fleschEase: number;
  fleschKincaid: number;
  gunningFog: number;
  smog: number;
  colemanLiau: number;
  automated: number;
  linsearWrite: number;
  /** The median of the grade-level scores. */
  grade: number;
  /** A reader name for the grade, such as "8th to 9th grade". */
  level: string;
  /** A plain description of the Flesch reading ease. */
  ease: string;
}

export interface FullStats {
  words: number;
  characters: number;
  charactersNoSpaces: number;
  letters: number;
  sentences: number;
  paragraphs: number;
  uniqueWords: number;
  /** Unique words as a share of all words. */
  uniqueShare: number;
  syllables: number;
  /** Words of three or more syllables. */
  complexWords: number;
  /** Words of one syllable. */
  monosyllables: number;
  averageWordLength: number;
  averageSyllables: number;
  averageSentenceWords: number;
  /** The spread of sentence lengths, in words. */
  sentenceSpread: number;
  averageParagraphWords: number;
  longestSentence: SentenceNote | null;
  shortestSentence: SentenceNote | null;
  longSentences: SentenceNote[];
  /** Words that end in "ly", most of them adverbs. */
  adverbs: number;
  /** Phrases such as "was taken" or "is being made". A pattern finds them, so the count is close, not exact. */
  passive: SentenceNote[];
  /** Content words as a share of all words. */
  lexicalDensity: number;
  readingMinutes: number;
  speakingMinutes: number;
  handwritingMinutes: number;
  typingMinutes: number;
  pagesSingle: number;
  pagesDouble: number;
  readability: Readability | null;
  keywords: Keyword[];
  phrases2: Keyword[];
  phrases3: Keyword[];
}

/** Words that keyword density leaves out. */
export const STOP_WORDS: ReadonlySet<string> = new Set(
  (
    "a about above after again against all am an and any are aren't as at be because been before being " +
    "below between both but by can can't cannot could couldn't did didn't do does doesn't doing don't down " +
    "during each few for from further had hadn't has hasn't have haven't having he he'd he'll he's her here " +
    "here's hers herself him himself his how how's i i'd i'll i'm i've if in into is isn't it it's its itself " +
    "let's me more most mustn't my myself no nor not of off on once only or other ought our ours ourselves out " +
    "over own same shan't she she'd she'll she's should shouldn't so some such than that that's the their " +
    "theirs them themselves then there there's these they they'd they'll they're they've this those through " +
    "to too under until up very was wasn't we we'd we'll we're we've were weren't what what's when when's " +
    "where where's which while who who's whom why why's with won't would wouldn't you you'd you'll you're " +
    "you've your yours yourself yourselves just also like said one would could will can get got even still " +
    'back now well much many us oh yes ok okay'
  ).split(' '),
);

const PASSIVE =
  /\b(?:am|is|are|was|were|be|been|being|get|gets|got|gotten)\s+(?:\w+ly\s+)?(?:\w+ed|born|built|caught|chosen|done|drawn|driven|eaten|fallen|felt|forgotten|forgiven|found|given|gone|grown|heard|held|hidden|hit|hurt|kept|known|laid|led|left|lost|made|meant|met|paid|put|read|ridden|run|said|seen|sent|set|shaken|shown|shut|sold|spoken|spent|stolen|struck|taken|taught|thrown|told|torn|understood|won|worn|written)\b/gi;
/** Adjectives ending in "-ed" after "is" or "was" that are not passive. */
const NOT_PASSIVE =
  /\b(?:tired|bored|excited|interested|scared|worried|married|surprised|pleased|supposed|used|concerned|related|based|ashamed|annoyed|amazed|confused|exhausted|relaxed|tied)\b/i;

function note(sentence: Sentence): SentenceNote {
  return { from: sentence.from, to: sentence.to, words: sentence.words.length, text: sentence.text };
}

let graphemes: Intl.Segmenter | null = null;

function countGraphemes(text: string): number {
  graphemes ??= new Intl.Segmenter(undefined, { granularity: 'grapheme' });
  let count = 0;
  for (const part of graphemes.segment(text)) if (part.segment !== '\n') count += 1;
  return count;
}

const round1 = (value: number) => Math.round(value * 10) / 10;

/** "8th grade", "college", from a US school grade. */
export function gradeLevel(grade: number): string {
  if (grade < 1) return 'kindergarten';
  if (grade >= 17) return 'college graduate';
  if (grade >= 13) return 'college';
  const whole = Math.round(grade);
  const suffix = whole === 1 ? 'st' : whole === 2 ? 'nd' : whole === 3 ? 'rd' : 'th';
  return `${String(whole)}${suffix} grade`;
}

/** Flesch's own names for each band of reading ease. */
export function easeLabel(ease: number): string {
  if (ease >= 90) return 'very easy';
  if (ease >= 80) return 'easy';
  if (ease >= 70) return 'fairly easy';
  if (ease >= 60) return 'plain English';
  if (ease >= 50) return 'fairly difficult';
  if (ease >= 30) return 'difficult';
  return 'very difficult';
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? (sorted[middle] ?? 0)
    : ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2;
}

function readability(
  words: number,
  sentences: number,
  syllables: number,
  complex: number,
  letters: number,
  linsear: number,
): Readability | null {
  if (words === 0 || sentences === 0) return null;
  const wps = words / sentences;
  const spw = syllables / words;
  const fleschEase = 206.835 - 1.015 * wps - 84.6 * spw;
  const fleschKincaid = 0.39 * wps + 11.8 * spw - 15.59;
  const gunningFog = 0.4 * (wps + (100 * complex) / words);
  const smog = 1.043 * Math.sqrt(complex * (30 / sentences)) + 3.1291;
  const colemanLiau = 0.0588 * ((100 * letters) / words) - 0.296 * ((100 * sentences) / words) - 15.8;
  const automated = 4.71 * (letters / words) + 0.5 * wps - 21.43;
  const grades = [fleschKincaid, gunningFog, smog, colemanLiau, automated, linsear].map((g) =>
    Math.max(0, g),
  );
  const grade = median(grades);
  return {
    fleschEase: round1(Math.max(0, Math.min(100, fleschEase))),
    fleschKincaid: round1(Math.max(0, fleschKincaid)),
    gunningFog: round1(gunningFog),
    smog: round1(smog),
    colemanLiau: round1(Math.max(0, colemanLiau)),
    automated: round1(Math.max(0, automated)),
    linsearWrite: round1(Math.max(0, linsear)),
    grade: round1(grade),
    level: gradeLevel(grade),
    ease: easeLabel(fleschEase),
  };
}

/** Linsear Write on the first 100 words, as the formula asks. */
function linsearWrite(sentences: readonly Sentence[], syllables: (word: string) => number): number {
  let words = 0;
  let score = 0;
  let count = 0;
  for (const sentence of sentences) {
    if (words >= 100) break;
    count += 1;
    for (const word of sentence.words) {
      if (words >= 100) break;
      words += 1;
      score += syllables(word.lower) >= 3 ? 3 : 1;
    }
  }
  if (count === 0 || words === 0) return 0;
  const raw = score / count;
  return raw > 20 ? raw / 2 : raw / 2 - 1;
}

function topKeywords(counts: Map<string, number>, total: number, size: number, limit: number): Keyword[] {
  return [...counts.entries()]
    .filter(([, count]) => count >= 2)
    .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
    .slice(0, limit)
    .map(([phrase, count]) => ({ phrase, count, density: round1((100 * count * size) / total) }));
}

/** All the statistics of a plain text. `kind` decides what a paragraph is: a poem counts lines. */
export function fullStats(
  text: string,
  kind: EditorForm,
  syllables: CountSyllables,
  language?: string,
): FullStats {
  const sentences = sentencesOf(text);
  const words = sentences.flatMap((sentence) => sentence.words);
  // A word that Intl finds outside a sentence, such as a lone number, still counts.
  const allWords = words.length > 0 ? words : wordsOf(text);
  const n = allWords.length;
  const memo = new Map<string, number>();
  const syllablesOf = (word: string) => {
    let found = memo.get(word);
    if (found === undefined) {
      found = /\p{L}/u.test(word) ? Math.max(1, syllables(word)) : 1;
      memo.set(word, found);
    }
    return found;
  };
  let syllableTotal = 0;
  let complexWords = 0;
  let monosyllables = 0;
  let letters = 0;
  let adverbs = 0;
  let content = 0;
  const unique = new Set<string>();
  const ones = new Map<string, number>();
  for (const word of allWords) {
    const count = syllablesOf(word.lower);
    syllableTotal += count;
    if (count >= 3 && !word.lower.includes('-')) complexWords += 1;
    if (count === 1) monosyllables += 1;
    letters += word.text.replace(/[^\p{L}\p{N}]/gu, '').length;
    if (word.lower.length > 4 && word.lower.endsWith('ly')) adverbs += 1;
    unique.add(word.lower);
    if (!STOP_WORDS.has(word.lower) && /\p{L}/u.test(word.lower)) {
      content += 1;
      if (word.lower.length > 1) ones.set(word.lower, (ones.get(word.lower) ?? 0) + 1);
    }
  }
  const twos = new Map<string, number>();
  const threes = new Map<string, number>();
  for (const sentence of sentences) {
    const list = sentence.words.map((word) => word.lower);
    for (let i = 0; i < list.length; i += 1) {
      const a = list[i] ?? '';
      const b = list[i + 1];
      const c = list[i + 2];
      if (b !== undefined && !STOP_WORDS.has(a) && !STOP_WORDS.has(b)) {
        const key = `${a} ${b}`;
        twos.set(key, (twos.get(key) ?? 0) + 1);
      }
      if (b !== undefined && c !== undefined && !STOP_WORDS.has(a) && !STOP_WORDS.has(c)) {
        const key = `${a} ${b} ${c}`;
        threes.set(key, (threes.get(key) ?? 0) + 1);
      }
    }
  }
  const paragraphs =
    kind === 'poem'
      ? text.split('\n').filter((line) => line.trim() !== '').length
      : new Set(sentences.map((sentence) => sentence.paragraph)).size;
  const lengths = sentences.map((sentence) => sentence.words.length);
  const sorted = [...sentences].sort((a, b) => b.words.length - a.words.length);
  const shortest = sorted.at(-1);
  const characters = countGraphemes(text);
  const charactersNoSpaces = countGraphemes(text.replace(/\s+/g, ''));
  const passive: SentenceNote[] = [];
  for (const sentence of sentences) {
    PASSIVE.lastIndex = 0;
    for (let match = PASSIVE.exec(sentence.text); match !== null; match = PASSIVE.exec(sentence.text)) {
      if (NOT_PASSIVE.test(match[0])) continue;
      const from = sentence.from + match.index;
      passive.push({ from, to: from + match[0].length, words: match[0].split(/\s+/).length, text: match[0] });
    }
  }
  const minutes = (wpm: number) => (n === 0 ? 0 : n / wpm);
  return {
    // The count is the one of the word counter, so the two always agree: characters in Chinese and Japanese
    // (F38), and count rule 2 elsewhere. The other statistics read the words one by one.
    words: countWords(text, language),
    characters,
    charactersNoSpaces,
    letters,
    sentences: sentences.length,
    paragraphs,
    uniqueWords: unique.size,
    uniqueShare: n === 0 ? 0 : unique.size / n,
    syllables: syllableTotal,
    complexWords,
    monosyllables,
    averageWordLength: n === 0 ? 0 : round1(letters / n),
    averageSyllables: n === 0 ? 0 : Math.round((100 * syllableTotal) / n) / 100,
    averageSentenceWords: round1(mean(lengths)),
    sentenceSpread: round1(deviation(lengths)),
    averageParagraphWords: paragraphs === 0 ? 0 : round1(n / paragraphs),
    longestSentence: sorted[0] ? note(sorted[0]) : null,
    shortestSentence: shortest ? note(shortest) : null,
    longSentences: sentences.filter((sentence) => sentence.words.length > LONG_SENTENCE).map(note),
    adverbs,
    passive,
    lexicalDensity: n === 0 ? 0 : content / n,
    readingMinutes: minutes(READING_WPM),
    speakingMinutes: minutes(SPEAKING_WPM),
    handwritingMinutes: minutes(HANDWRITING_WPM),
    typingMinutes: minutes(TYPING_WPM),
    pagesSingle: n / WORDS_PER_PAGE.single,
    pagesDouble: n / WORDS_PER_PAGE.double,
    readability: readability(
      n,
      sentences.length,
      syllableTotal,
      complexWords,
      letters,
      linsearWrite(sentences, syllablesOf),
    ),
    keywords: topKeywords(ones, n, 1, 20),
    phrases2: topKeywords(twos, n, 2, 10),
    phrases3: topKeywords(threes, n, 3, 10),
  };
}

/** "45 sec", "about 3 min", "about 1 h 20 min". */
export function durationLabel(minutes: number): string {
  if (minutes <= 0) return 'none';
  if (minutes < 1) return `${String(Math.max(1, Math.round(minutes * 60)))} sec`;
  const whole = Math.round(minutes);
  if (whole < 60) return `about ${String(whole)} min`;
  const hours = Math.floor(whole / 60);
  const rest = whole % 60;
  return rest === 0 ? `about ${String(hours)} h` : `about ${String(hours)} h ${String(rest)} min`;
}
