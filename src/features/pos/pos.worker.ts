/// <reference lib="webworker" />
import { answerCalls, loadOnce } from '@/lib/workerCall';
import { marksOf, plainQuotes, type PosMark } from './posTags';

/*
 * The parts-of-speech tagger off the main thread (Phase 19, Task D5), so typing never waits for it. The
 * tagger and its word list load with the first request only. Nothing leaves the device.
 */

export interface PosProtocol {
  /** The text of each block, from `blockText`. */
  request: { blocks: string[] };
  result: PosMark[][];
}

const load = loadOnce(async () => {
  const { default: tagger } = await import('wink-pos-tagger');
  return tagger();
});

answerCalls<PosProtocol>(async ({ blocks }) => {
  const tagger = await load();
  return blocks.map((text) =>
    text.trim() === '' ? [] : marksOf(text, tagger.tagSentence(plainQuotes(text))),
  );
});
