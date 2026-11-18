import { workerCaller } from '@/lib/workerCall';
import type { GrammarProtocol } from './grammar.worker';
import type { GrammarLint } from './lints';

/*
 * One grammar worker for the tab. It starts with the first check, so a writer who never turns the check on
 * never loads it or Harper.
 */

const call = workerCaller<GrammarProtocol>(
  () => new Worker(new URL('./grammar.worker.ts', import.meta.url), { type: 'module' }),
  'The grammar checker did not load.',
);

/** Checks the text of each block in the worker. */
export function checkInWorker(blocks: readonly string[], dialect: number): Promise<GrammarLint[][]> {
  return call({ blocks: [...blocks], dialect });
}
