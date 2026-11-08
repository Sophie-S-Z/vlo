import { deviation, mean, plainChars, sentencesOf, type Sentence } from '../text';
import { findTells, tellCounts, TELL_GROUPS, type Tell, type TellGroup } from './tells';

/*
 * The inputs of the AI writing model: style measures that need no language model, so the check runs on
 * the device, offline and for free. Each measure is a rate, so a short text and a long text compare.
 * scripts/train-ai-detector.mjs computes the same measures on labeled human and AI texts and fits the
 * weights in model.ts. A change here needs a new training run.
 */

/** Common words whose rates mark a writer's style (stylometry). */
export const FUNCTION_WORDS = [
  'the',
  'a',
  'an',
  'and',
  'but',
  'or',
  'so',
  'of',
  'to',
  'in',
  'on',
  'at',
  'for',
  'with',
  'as',
  'by',
  'from',
  'that',
  'this',
  'which',
  'who',
  'it',
  'is',
  'was',
  'were',
  'be',
  'been',
  'had',
  'have',
  'has',
  'not',
  'no',
  'all',
  'just',
  'like',
  'very',
  'really',
  'there',
  'then',
  'would',
  'could',
  'can',
  'will',
  'more',
  'also',
  'its',
  'their',
  'they',
  'he',
  'she',
  'his',
  'her',
  'we',
  'our',
  'you',
  'your',
  'i',
  'me',
  'my',
  'what',
  'when',
  'if',
  'about',
  'up',
  'out',
  'into',
  'through',
  'while',
  'even',
  'only',
  'now',
  'because',
  'some',
  'one',
  'got',
  'get',
  'did',
  'do',
  'said',
  'know',
  'think',
  'thing',
  'yeah',
  'ok',
  'every',
  'each',
  'own',
  'both',
  'between',
  'towards',
  'toward',
  'upon',
  'among',
  'within',
  'though',
] as const;

const FUNCTION_SET = new Map<string, number>(FUNCTION_WORDS.map((word, index) => [word, index]));

const STYLE_NAMES = [
  'sentence_mean',
  'sentence_cv',
  'sentence_short',
  'sentence_long',
  'sentence_range',
  'paragraph_cv',
  'paragraph_sentences',
  'word_length',
  'word_long',
  'variety',
  'hapax',
  'contractions',
  'first_person',
  'second_person',
  'comma',
  'semicolon',
  'colon',
  'question',
  'exclaim',
  'ellipsis',
  'paren',
  'quote',
  'dialogue',
  'digits',
  'lower_start',
  'lower_i',
  'caps',
  'repeat_opener',
  'opener_the',
  'opener_pronoun',
  'opener_ing',
  'opener_conj',
  'adverb_ly',
  'repeat_bigram',
] as const;

export const FEATURE_NAMES: readonly string[] = [
  ...STYLE_NAMES,
  'lexicon_score',
  'lexicon_ai',
  'lexicon_human',
  ...TELL_GROUPS.map((group) => `tell_${group}`),
  ...FUNCTION_WORDS.map((word) => `fw_${word}`),
];

export const FEATURE_COUNT = FEATURE_NAMES.length;

/** The fewest words that the model scores. Shorter texts give a guess that is too noisy to show. */
export const MIN_WORDS = 40;

export interface FeatureInput {
  text: string;
  sentences: readonly Sentence[];
  tells: readonly Tell[];
}

/** The part of a prepared text from sentence `start` up to, not including, sentence `end`. */
export function windowOf(input: FeatureInput, start: number, end: number): FeatureInput {
  const sentences = input.sentences.slice(start, end);
  const from = sentences[0]?.from ?? 0;
  const to = sentences.at(-1)?.to ?? 0;
  return {
    text: input.text.slice(from, to),
    sentences,
    tells: input.tells.filter((tell) => tell.from >= from && tell.to <= to),
  };
}

/**
 * Words whose use differs between human and AI texts in the training data, with the log odds of AI use.
 * The training script finds them; the model ships them.
 */
export type Lexicon = ReadonlyMap<string, number>;

/** Prepares a text for `featuresOf`. */
export function featureInput(text: string): FeatureInput {
  const plain = plainChars(text);
  return { text: plain, sentences: sentencesOf(plain), tells: findTells(plain) };
}

const CONTRACTION = /^[a-z]+'(?:t|s|re|ll|ve|d|m)$/;
const FIRST = new Set(['i', 'me', 'my', 'mine', 'myself', "i'm", "i've", "i'd", "i'll"]);
const SECOND = new Set(['you', 'your', 'yours', 'yourself', "you're", "you've", "you'll", "you'd"]);
const PRONOUN_OPENERS = new Set(['i', 'he', 'she', 'it', 'they', 'we', 'you', 'his', 'her', 'their', 'my']);
const CONJ_OPENERS = new Set(['and', 'but', 'so', 'or', 'yet', 'because']);

function count(text: string, pattern: RegExp): number {
  return text.match(pattern)?.length ?? 0;
}

/** Moving-average type-token ratio over windows of 50 words. It does not fall as a text grows. */
function variety(words: readonly string[]): number {
  const size = 50;
  if (words.length === 0) return 0;
  if (words.length <= size) return new Set(words).size / words.length;
  const counts = new Map<string, number>();
  const add = (word: string, change: number) => {
    const next = (counts.get(word) ?? 0) + change;
    if (next === 0) counts.delete(word);
    else counts.set(word, next);
  };
  for (const word of words.slice(0, size)) add(word, 1);
  let total = counts.size;
  let windows = 1;
  for (let i = size; i < words.length; i += 1) {
    add(words[i - size] ?? '', -1);
    add(words[i] ?? '', 1);
    total += counts.size;
    windows += 1;
  }
  return total / windows / size;
}

/** The share of words, in the first 100, that appear once. */
function hapax(words: readonly string[]): number {
  const sample = words.slice(0, 100);
  if (sample.length === 0) return 0;
  const counts = new Map<string, number>();
  for (const word of sample) counts.set(word, (counts.get(word) ?? 0) + 1);
  let once = 0;
  for (const value of counts.values()) if (value === 1) once += 1;
  return once / sample.length;
}

/**
 * The feature vector of a text, in the order of FEATURE_NAMES, or null when the text has fewer than
 * MIN_WORDS words.
 */
export function featuresOf(input: FeatureInput, lexicon: Lexicon): number[] | null {
  const { text, sentences, tells } = input;
  const words = sentences.flatMap((sentence) => sentence.words);
  const n = words.length;
  if (n < MIN_WORDS || sentences.length === 0) return null;
  const lower = words.map((word) => word.lower);
  const lengths = sentences.map((sentence) => Math.max(1, sentence.words.length));
  const sentenceMean = mean(lengths);
  const perParagraph = new Map<number, number>();
  for (const sentence of sentences)
    perParagraph.set(sentence.paragraph, (perParagraph.get(sentence.paragraph) ?? 0) + sentence.words.length);
  const paragraphLengths = [...perParagraph.values()];
  const s = sentences.length;
  const per100 = (value: number) => (100 * value) / n;
  const perSentence = (value: number) => value / s;

  const openers = sentences.map((sentence) => sentence.words[0]?.lower ?? '');
  let repeatOpener = 0;
  for (let i = 1; i < openers.length; i += 1)
    if (openers[i] !== '' && openers[i] === openers[i - 1]) repeatOpener += 1;

  const bigrams = new Map<string, number>();
  for (let i = 1; i < lower.length; i += 1) {
    const key = `${lower[i - 1] ?? ''} ${lower[i] ?? ''}`;
    bigrams.set(key, (bigrams.get(key) ?? 0) + 1);
  }
  let repeatBigram = 0;
  for (const value of bigrams.values()) if (value > 1) repeatBigram += value - 1;

  let lowerStart = 0;
  for (const sentence of sentences) {
    const first = sentence.words[0]?.text ?? '';
    if (/^\p{Ll}/u.test(first)) lowerStart += 1;
  }

  const style: Record<(typeof STYLE_NAMES)[number], number> = {
    sentence_mean: sentenceMean,
    sentence_cv: sentenceMean === 0 ? 0 : deviation(lengths) / sentenceMean,
    sentence_short: lengths.filter((length) => length <= 6).length / s,
    sentence_long: lengths.filter((length) => length >= 35).length / s,
    sentence_range: s < 2 ? 0 : (Math.max(...lengths) - Math.min(...lengths)) / sentenceMean,
    paragraph_cv:
      paragraphLengths.length < 2 ? 0 : deviation(paragraphLengths) / Math.max(1, mean(paragraphLengths)),
    paragraph_sentences: s / Math.max(1, paragraphLengths.length),
    word_length: mean(words.map((word) => word.text.length)),
    word_long: words.filter((word) => word.text.length >= 8).length / n,
    variety: variety(lower),
    hapax: hapax(lower),
    contractions: per100(lower.filter((word) => CONTRACTION.test(word)).length),
    first_person: per100(lower.filter((word) => FIRST.has(word)).length),
    second_person: per100(lower.filter((word) => SECOND.has(word)).length),
    comma: perSentence(count(text, /,/g)),
    semicolon: per100(count(text, /;/g)),
    colon: per100(count(text, /:/g)),
    question: perSentence(count(text, /\?/g)),
    exclaim: perSentence(count(text, /!/g)),
    ellipsis: per100(count(text, /\.\.\.|\u2026/g)),
    paren: per100(count(text, /\(/g)),
    quote: per100(count(text, /"/g)),
    dialogue: sentences.filter((sentence) => sentence.text.includes('"')).length / s,
    digits: per100(count(text, /\d+/g)),
    lower_start: lowerStart / s,
    lower_i: per100(words.filter((word) => word.text === 'i').length),
    caps: per100(words.filter((word) => word.text.length > 1 && /^\p{Lu}+$/u.test(word.text)).length),
    repeat_opener: s < 2 ? 0 : repeatOpener / (s - 1),
    opener_the: openers.filter((word) => word === 'the').length / s,
    opener_pronoun: openers.filter((word) => PRONOUN_OPENERS.has(word)).length / s,
    opener_ing: openers.filter((word) => word.length > 4 && word.endsWith('ing')).length / s,
    opener_conj: openers.filter((word) => CONJ_OPENERS.has(word)).length / s,
    adverb_ly: per100(lower.filter((word) => word.length > 4 && word.endsWith('ly')).length),
    repeat_bigram: repeatBigram / n,
  };

  let lexiconScore = 0;
  let lexiconAi = 0;
  let lexiconHuman = 0;
  for (const word of lower) {
    const odds = lexicon.get(word);
    if (odds === undefined) continue;
    lexiconScore += odds;
    if (odds > 0) lexiconAi += 1;
    else lexiconHuman += 1;
  }

  const groups = tellCounts(tells);
  const functionCounts = new Array<number>(FUNCTION_WORDS.length).fill(0);
  for (const word of lower) {
    const index = FUNCTION_SET.get(word);
    if (index !== undefined) functionCounts[index] = (functionCounts[index] ?? 0) + 1;
  }
  return [
    ...STYLE_NAMES.map((name) => style[name]),
    lexiconScore / n,
    per100(lexiconAi),
    per100(lexiconHuman),
    ...TELL_GROUPS.map((group: TellGroup) => per100(groups[group])),
    ...functionCounts.map(per100),
  ];
}
