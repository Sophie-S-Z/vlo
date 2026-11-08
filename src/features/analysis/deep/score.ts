import { sentencesOf, wordsOf, type Span } from '../text';

/*
 * The deep check: a language model in the browser reads the text one token at a time, and each step gives
 * the model's full next-token distribution. The score is the analytic criterion of Fast-DetectGPT (Bao et
 * al., ICLR 2024), with the same model for sampling and scoring. For each token it compares the log
 * probability of the token in the text with the mean log probability that the model expects at that place.
 * AI text picks tokens that the model ranks high, so it scores above the mean. Human text picks more
 * surprising tokens, so it scores near or below the mean.
 *
 * This file has the math only. It has no model, so tests can run it with made-up distributions.
 */

/** One scored token: its log probability, and the mean and variance of the log probability. */
export interface TokenStat {
  lp: number;
  mu: number;
  v: number;
}

/** A window needs this many scored tokens for a score. */
export const MIN_TOKENS = 40;
/** The whole text needs this many scored tokens for an overall result. */
export const MIN_REPORT_TOKENS = 100;

/**
 * The statistics of one step, from the raw logits and the token that comes next in the text. With y = logit
 * minus the largest logit and p = softmax(y), the log probability of a token is y - log(sum e^y), so its
 * mean under p is E[y] - log(sum e^y) and its variance is the variance of y.
 */
export function tokenStat(logits: Float32Array | readonly number[], target: number): TokenStat {
  let max = -Infinity;
  for (const value of logits) if (value > max) max = value;
  let sum = 0;
  let first = 0;
  let second = 0;
  for (const value of logits) {
    const y = value - max;
    if (!(y > -Infinity)) continue;
    const e = Math.exp(y);
    sum += e;
    first += e * y;
    second += e * y * y;
  }
  const logSum = Math.log(sum);
  const mean = first / sum;
  const own = logits[target];
  return {
    // A floor keeps one odd token from swamping the sums.
    lp: own === undefined ? -30 : Math.max(-30, own - max - logSum),
    mu: mean - logSum,
    v: Math.max(1e-6, second / sum - mean * mean),
  };
}

/**
 * The criterion for a run of tokens, divided by the square root of the count so that a long text and a
 * short one share one scale. Null when the run is too short.
 */
export function discrepancy(stats: readonly TokenStat[], min = MIN_TOKENS): number | null {
  if (stats.length < min) return null;
  let lp = 0;
  let mu = 0;
  let v = 0;
  for (const s of stats) {
    lp += s.lp;
    mu += s.mu;
    v += s.v;
  }
  return (lp - mu) / Math.sqrt(v * stats.length);
}

/* Calibration ------------------------------------------------------------------------------------------ */

/** Change this when the reference passages or the math change, so that each device sets its cuts again. */
export const CALIBRATION_VERSION = 1;

export interface Calibration {
  version: number;
  model: string;
  human: { mean: number; sd: number; count: number; flagged: number };
  ai: { mean: number; sd: number; count: number; caught: number };
  /** The scores where the bands "some" and "many" start. */
  cuts: { some: number; many: number };
  /** False when the model did not separate the reference passages well, so its result means little. */
  useful: boolean;
}

function meanSd(values: readonly number[]): { mean: number; sd: number } {
  const mean = values.reduce((a, b) => a + b, 0) / Math.max(1, values.length);
  const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(1, values.length - 1);
  return { mean, sd: Math.sqrt(variance) };
}

/**
 * Sets the cuts from the scores of the human reference passages: "some" at the 90th percentile of a normal
 * fit and "many" at the 99th. The AI passages only measure how well the cuts work on this device.
 */
export function calibrate(model: string, human: readonly number[], ai: readonly number[]): Calibration {
  const h = meanSd(human);
  const a = meanSd(ai);
  const sd = Math.max(h.sd, 0.02);
  const cuts = { some: h.mean + 1.2816 * sd, many: h.mean + 2.3263 * sd };
  const caught = ai.filter((score) => score >= cuts.many).length;
  return {
    version: CALIBRATION_VERSION,
    model,
    human: { ...h, count: human.length, flagged: human.filter((score) => score >= cuts.many).length },
    ai: { ...a, count: ai.length, caught },
    cuts,
    useful: ai.length > 0 && caught * 2 >= ai.length,
  };
}

/* The report ------------------------------------------------------------------------------------------- */

export type DeepBand = 'few' | 'some' | 'many';

export interface DeepSentence extends Span {
  /** Null when the check did not read this sentence. */
  score: number | null;
  marked: boolean;
}

export interface DeepReport {
  model: string;
  /** Scored tokens. */
  tokens: number;
  /** Words in the sentences that the check read, and in the whole text. */
  wordsRead: number;
  words: number;
  /** False when the text is too short for an overall result. */
  enough: boolean;
  score: number;
  band: DeepBand;
  /** The share of the words read that are in marked sentences, 0 to 1. */
  share: number;
  sentences: DeepSentence[];
  calibration: Calibration;
}

export function bandOf(score: number, cuts: Calibration['cuts']): DeepBand {
  return score >= cuts.many ? 'many' : score >= cuts.some ? 'some' : 'few';
}

/** The tokens of one sentence, with the whitespace before it, so that the pieces join to the text. */
export interface SentencePiece extends Span {
  text: string;
  words: number;
}

/** Splits the text into sentences. Each piece starts after the end of the sentence before it. */
export function piecesOf(text: string): SentencePiece[] {
  let end = 0;
  return sentencesOf(text).map((sentence) => {
    const piece = {
      from: sentence.from,
      to: sentence.to,
      text: text.slice(end, sentence.to),
      words: sentence.words.length,
    };
    end = sentence.to;
    return piece;
  });
}

/** Most tokens that one block reads with one context. */
export const BLOCK_TOKENS = 512;
/** Most tokens that the check reads in one text, about 1,100 words. */
export const MAX_TOKENS = 1536;

/**
 * Groups the sentences into blocks of at most BLOCK_TOKENS, then keeps blocks spread over the whole text
 * until MAX_TOKENS. Each block is a list of sentence indexes.
 */
export function blocksOf(
  tokenCounts: readonly number[],
  blockTokens = BLOCK_TOKENS,
  maxTokens = MAX_TOKENS,
): number[][] {
  const blocks: { members: number[]; tokens: number }[] = [];
  let current: { members: number[]; tokens: number } = { members: [], tokens: 0 };
  tokenCounts.forEach((count, i) => {
    if (current.members.length > 0 && current.tokens + count > blockTokens) {
      blocks.push(current);
      current = { members: [], tokens: 0 };
    }
    current.members.push(i);
    current.tokens += count;
  });
  if (current.members.length > 0) blocks.push(current);
  const total = blocks.reduce((sum, b) => sum + b.tokens, 0);
  if (total <= maxTokens) return blocks.map((b) => b.members);
  const keep = Math.max(1, Math.floor((maxTokens / total) * blocks.length));
  const picked: number[][] = [];
  let used = 0;
  for (let k = 0; k < keep; k += 1) {
    const block = blocks[Math.floor(((k + 0.5) * blocks.length) / keep)];
    if (!block || used + block.tokens > maxTokens) continue;
    picked.push(block.members);
    used += block.tokens;
  }
  return picked;
}

/**
 * Builds the report from the scored tokens of each sentence. A sentence that the check did not read has
 * no entry in `stats`. Passages are windows of six sentences, two apart, as in the style check.
 */
export function deepReport(
  text: string,
  pieces: readonly SentencePiece[],
  stats: ReadonlyMap<number, readonly TokenStat[]>,
  calibration: Calibration,
): DeepReport {
  const all = [...stats.values()].flat();
  const score = discrepancy(all, 1) ?? 0;
  const sums = new Array<number>(pieces.length).fill(0);
  const counts = new Array<number>(pieces.length).fill(0);
  for (let start = 0; start < pieces.length; start += 2) {
    const members: number[] = [];
    for (let i = start; i < Math.min(pieces.length, start + 6); i += 1) if (stats.has(i)) members.push(i);
    const windowStats = members.flatMap((i) => stats.get(i) ?? []);
    const value = discrepancy(windowStats);
    if (value !== null)
      for (const i of members) {
        sums[i] = (sums[i] ?? 0) + value;
        counts[i] = (counts[i] ?? 0) + 1;
      }
    if (start + 6 >= pieces.length) break;
  }
  const sentences = pieces.map((piece, i): DeepSentence => {
    const count = counts[i] ?? 0;
    const value = count === 0 ? null : (sums[i] ?? 0) / count;
    return {
      from: piece.from,
      to: piece.to,
      score: value,
      marked: value !== null && value >= calibration.cuts.many,
    };
  });
  let wordsRead = 0;
  let marked = 0;
  pieces.forEach((piece, i) => {
    if (!stats.has(i)) return;
    wordsRead += piece.words;
    if (sentences[i]?.marked) marked += piece.words;
  });
  return {
    model: calibration.model,
    tokens: all.length,
    wordsRead,
    words: wordsOf(text).length,
    enough: all.length >= MIN_REPORT_TOKENS,
    score,
    band: bandOf(score, calibration.cuts),
    share: wordsRead === 0 ? 0 : marked / wordsRead,
    sentences,
    calibration,
  };
}

/** One line on how the style check and the deep check agree. */
export function agreement(style: DeepBand, deep: DeepBand): string {
  if (style === deep && style === 'many') return 'Both checks find many signs of AI writing.';
  if (style === deep && style === 'few') return 'Both checks find few signs of AI writing.';
  if ((style === 'many' && deep === 'few') || (style === 'few' && deep === 'many'))
    return 'The two checks disagree. Treat the result as uncertain, and read the marked passages.';
  if (style === 'many' || deep === 'many')
    return 'One check finds many signs of AI writing, and the other finds some.';
  return 'The checks find some signs at most. Many human texts score in this range.';
}
