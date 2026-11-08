import { db } from '@/lib/db';
import { REFERENCES } from './references';
import {
  blocksOf,
  calibrate,
  CALIBRATION_VERSION,
  deepReport,
  discrepancy,
  piecesOf,
  type Calibration,
  type DeepReport,
  type TokenStat,
} from './score';

/*
 * Runs the deep check with a scorer: a language model that gives the statistics of each next token. The
 * first run on a device reads the reference passages and keeps the cuts in appMeta for that model.
 */

export interface Scorer {
  /** The model id. */
  model: string;
  /** The model's name for the writer. */
  label: string;
  tokenize: (text: string) => number[];
  /**
   * Reads the tokens with a fresh context. Entry i of the result is for token i + 1, because the first
   * token has nothing before it. `onStep` runs after each token.
   */
  read: (ids: readonly number[], signal: AbortSignal, onStep: () => void) => Promise<TokenStat[]>;
}

export type Progress = (done: number, total: number) => void;

const calibrationKey = (model: string) => `deep-calibration:${model}`;

export async function savedCalibration(model: string): Promise<Calibration | null> {
  const value = (await db.appMeta.get(calibrationKey(model)))?.value as Partial<Calibration> | undefined;
  if (value?.version !== CALIBRATION_VERSION || value.model !== model) return null;
  return value as Calibration;
}

export async function forgetCalibration(model: string): Promise<void> {
  await db.appMeta.delete(calibrationKey(model));
}

/** Reads each reference passage, sets the cuts, and keeps them for the next check. */
export async function runCalibration(
  scorer: Scorer,
  signal: AbortSignal,
  onProgress: Progress,
): Promise<Calibration> {
  const passages = REFERENCES.map((reference) => ({ reference, ids: scorer.tokenize(reference.text) }));
  const total = passages.reduce((sum, p) => sum + Math.max(0, p.ids.length - 1), 0);
  let done = 0;
  const human: number[] = [];
  const ai: number[] = [];
  for (const { reference, ids } of passages) {
    const stats = await scorer.read(ids, signal, () => {
      done += 1;
      onProgress(done, total);
    });
    const score = discrepancy(stats, 1);
    if (score === null) continue;
    (reference.kind === 'human' ? human : ai).push(score);
  }
  const calibration = calibrate(scorer.model, human, ai);
  await db.appMeta.put({ key: calibrationKey(scorer.model), value: calibration });
  return calibration;
}

/** Reads the text in blocks of sentences and builds the report. */
export async function runDeepCheck(
  text: string,
  scorer: Scorer,
  calibration: Calibration,
  signal: AbortSignal,
  onProgress: Progress,
): Promise<DeepReport> {
  const pieces = piecesOf(text);
  const ids = pieces.map((piece) => scorer.tokenize(piece.text));
  const blocks = blocksOf(ids.map((list) => list.length));
  const total = blocks.reduce(
    (sum, block) => sum + block.reduce((s, i) => s + (ids[i]?.length ?? 0), 0) - 1,
    0,
  );
  let done = 0;
  const stats = new Map<number, TokenStat[]>();
  for (const block of blocks) {
    const tokens: number[] = [];
    const owner: number[] = [];
    for (const i of block)
      for (const id of ids[i] ?? []) {
        tokens.push(id);
        owner.push(i);
      }
    if (tokens.length < 2) continue;
    const read = await scorer.read(tokens, signal, () => {
      done += 1;
      onProgress(done, total);
    });
    read.forEach((stat, j) => {
      const sentence = owner[j + 1];
      if (sentence === undefined) return;
      const list = stats.get(sentence) ?? [];
      list.push(stat);
      stats.set(sentence, list);
    });
  }
  return deepReport(text, pieces, stats, calibration);
}
