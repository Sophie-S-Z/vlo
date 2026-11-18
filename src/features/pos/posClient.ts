import { workerCaller } from '@/lib/workerCall';
import type { PosProtocol } from './pos.worker';
import type { PosMark } from './posTags';

/*
 * One parts-of-speech worker for the tab. It starts with the first request, so a writer who never shows
 * the parts of speech never loads it or the tagger.
 */

const call = workerCaller<PosProtocol>(
  () => new Worker(new URL('./pos.worker.ts', import.meta.url), { type: 'module' }),
  'The parts-of-speech tagger did not load.',
);

/** Tags the text of each block in the worker. */
export function tagInWorker(blocks: readonly string[]): Promise<PosMark[][]> {
  return call({ blocks: [...blocks] });
}
