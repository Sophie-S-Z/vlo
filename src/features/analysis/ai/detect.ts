import type { Span } from '../text';
import {
  featureInput,
  featuresOf,
  FEATURE_NAMES,
  windowOf,
  type FeatureInput,
  type Lexicon,
} from './features';
import { integrityFlags, type IntegrityFlag } from './integrity';
import { MODEL } from './model';
import type { ModelData } from './modelData';
import { TELL_GROUPS, type Tell, type TellGroup } from './tells';

/*
 * The AI writing check. It scores the whole text, then passages of about six sentences, and marks each
 * sentence by the passages that hold it, as Turnitin's AI report does. A score is the model's estimate of
 * the chance that a text like this one is AI writing. It is never proof: the model learned from a fixed
 * set of texts, and a person can write in a way that looks like a machine, and the reverse.
 */

/** A whole text needs this many words before the report gives an overall result. */
export const MIN_REPORT_WORDS = 150;
/** Turnitin shows no percent between 1 and 19, because false positives are most likely there. */
export const LOW_SHARE = 0.2;

export type Band = 'few' | 'some' | 'many';

export interface SentenceScore extends Span {
  score: number;
  marked: boolean;
}

export type SignalGroup = 'rhythm' | 'words' | 'phrases' | 'punctuation' | 'voice';

export interface Signal {
  group: SignalGroup;
  /** Positive values push the score toward AI, negative toward human. */
  weight: number;
}

export interface AiReport {
  words: number;
  /** False when the text is too short for an overall result. */
  enough: boolean;
  /** The model score of the whole text, 0 to 1. */
  score: number;
  band: Band;
  /** The share of words in marked sentences, 0 to 1. */
  share: number;
  sentences: SentenceScore[];
  signals: Signal[];
  tells: Tell[];
  /** Signs per 100 words. */
  tellRate: number;
  /** "typical" up to the human median, "above" up to the 99th percentile, then "far above". */
  tellLevel: 'typical' | 'above' | 'far above';
  flags: IntegrityFlag[];
  /** The scores where the bands "some" and "many" start. */
  cuts: { some: number; many: number };
}

let lexicon: Lexicon | null = null;

function lexiconOf(model: ModelData): Lexicon {
  if (model === MODEL) return (lexicon ??= new Map(model.lexicon));
  return new Map(model.lexicon);
}

function squash(value: number): number {
  return Math.sign(value) * Math.log1p(Math.abs(value));
}

function standardize(x: readonly number[], model: ModelData): number[] {
  return x.map((value, j) => {
    const z = (squash(value) - (model.means[j] ?? 0)) / (model.scales[j] ?? 1);
    return Math.max(-6, Math.min(6, z));
  });
}

function forward(z: readonly number[], model: ModelData): { logit: number; hidden: number[] } {
  const hidden = model.hidden.map((row, k) => {
    let sum = model.hiddenBias[k] ?? 0;
    for (let j = 0; j < z.length; j += 1) sum += (row[j] ?? 0) * (z[j] ?? 0);
    return Math.tanh(sum);
  });
  let logit = model.outputBias;
  hidden.forEach((h, k) => (logit += (model.output[k] ?? 0) * h));
  return { logit, hidden };
}

const sigmoid = (value: number) => 1 / (1 + Math.exp(-value));

/** The model score of a feature vector. */
export function scoreFeatures(x: readonly number[], model: ModelData = MODEL): number {
  return sigmoid(forward(standardize(x, model), model).logit);
}

function groupOf(name: string): SignalGroup {
  if (name.startsWith('sentence_') || name.startsWith('paragraph_')) return 'rhythm';
  if (name.startsWith('tell_')) return 'phrases';
  if (
    name.startsWith('lexicon_') ||
    ['word_length', 'word_long', 'variety', 'hapax', 'adverb_ly', 'repeat_bigram'].includes(name)
  )
    return 'words';
  if (
    name.startsWith('fw_') ||
    name.startsWith('opener_') ||
    ['contractions', 'first_person', 'second_person', 'repeat_opener'].includes(name)
  )
    return 'voice';
  return 'punctuation';
}

/**
 * What moved the score: for each group of measures, how much the score changes when the group is set to the
 * training average and the rest stay as they are. This explains this score only.
 */
function signalsOf(x: readonly number[], model: ModelData): Signal[] {
  const z = standardize(x, model);
  const base = forward(z, model).logit;
  const groups = new Map<SignalGroup, number[]>();
  model.features.forEach((name, j) => {
    const group = groupOf(name);
    groups.set(group, [...(groups.get(group) ?? []), j]);
  });
  return [...groups.entries()]
    .map(([group, members]) => {
      const without = [...z];
      for (const j of members) without[j] = 0;
      return { group, weight: base - forward(without, model).logit };
    })
    .sort((a, b) => Math.abs(b.weight) - Math.abs(a.weight));
}

/** Passages of at least six sentences and 60 words, two sentences apart, with their scores. */
function passageScores(
  input: FeatureInput,
  model: ModelData,
  words: Lexicon,
): { start: number; end: number; score: number }[] {
  const n = input.sentences.length;
  const found: { start: number; end: number; score: number }[] = [];
  const step = 2;
  for (let start = 0; start < n; start += step) {
    let end = Math.min(n, start + 6);
    let count = 0;
    for (let i = start; i < end; i += 1) count += input.sentences[i]?.words.length ?? 0;
    while (end < n && count < 60) {
      count += input.sentences[end]?.words.length ?? 0;
      end += 1;
    }
    const x = featuresOf(windowOf(input, start, end), words);
    if (x) found.push({ start, end, score: scoreFeatures(x, model) });
    if (end >= n) break;
  }
  return found;
}

export function checkAi(text: string, model: ModelData = MODEL): AiReport {
  if (
    model.features.length !== FEATURE_NAMES.length ||
    model.features.some((name, j) => name !== FEATURE_NAMES[j])
  )
    throw new Error('The AI model does not match the feature code. Run scripts/train-ai-detector.mjs again.');
  const words = lexiconOf(model);
  const input = featureInput(text);
  const wordCount = input.sentences.reduce((sum, sentence) => sum + sentence.words.length, 0);
  const whole = featuresOf(input, words);
  const score = whole ? scoreFeatures(whole, model) : 0;
  const passages = whole ? passageScores(input, model, words) : [];
  const sums = new Array<number>(input.sentences.length).fill(0);
  const counts = new Array<number>(input.sentences.length).fill(0);
  for (const passage of passages)
    for (let i = passage.start; i < passage.end; i += 1) {
      sums[i] = (sums[i] ?? 0) + passage.score;
      counts[i] = (counts[i] ?? 0) + 1;
    }
  const sentences = input.sentences.map((sentence, i): SentenceScore => {
    const value = (counts[i] ?? 0) === 0 ? 0 : (sums[i] ?? 0) / (counts[i] ?? 1);
    return { from: sentence.from, to: sentence.to, score: value, marked: value >= model.windowThreshold };
  });
  let markedWords = 0;
  input.sentences.forEach((sentence, i) => {
    if (sentences[i]?.marked) markedWords += sentence.words.length;
  });
  const tellRate = wordCount === 0 ? 0 : (100 * input.tells.length) / wordCount;
  const [median = 1, , top = 4.5] = model.humanTells;
  return {
    words: wordCount,
    enough: wordCount >= MIN_REPORT_WORDS,
    score,
    band: score >= model.threshold ? 'many' : score >= model.looseThreshold ? 'some' : 'few',
    share: wordCount === 0 ? 0 : markedWords / wordCount,
    sentences,
    signals: whole ? signalsOf(whole, model) : [],
    tells: [...input.tells],
    tellRate,
    tellLevel: tellRate <= median ? 'typical' : tellRate <= top ? 'above' : 'far above',
    flags: integrityFlags(text),
    cuts: { some: model.looseThreshold, many: model.threshold },
  };
}

/** The signs of each group, for the report, most common group first. */
export function tellsByGroup(tells: readonly Tell[]): { group: TellGroup; tells: Tell[] }[] {
  return TELL_GROUPS.map((group) => ({ group, tells: tells.filter((tell) => tell.group === group) }))
    .filter((entry) => entry.tells.length > 0)
    .sort((a, b) => b.tells.length - a.tells.length);
}

export const SIGNAL_LABEL: Readonly<Record<SignalGroup, string>> = {
  rhythm: 'Sentence and paragraph rhythm',
  words: 'Word choice and variety',
  phrases: 'Phrases that AI models overuse',
  punctuation: 'Punctuation habits',
  voice: 'Common words and voice',
};
