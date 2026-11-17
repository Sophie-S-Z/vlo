import { workerCaller } from '@/lib/workerCall';
import type { CraftProtocol } from './craft.worker';
import type { LineScan } from './scan';

/*
 * One Craft worker for the tab. It starts with the first scan, so a poet who never turns the labels on
 * never loads it or the dictionary.
 */

const call = workerCaller<CraftProtocol>(
  () => new Worker(new URL('./craft.worker.ts', import.meta.url), { type: 'module' }),
  'The pronouncing dictionary did not load.',
);

/** Scans the lines of a poem in the worker. */
export function scanInWorker(lines: readonly string[]): Promise<LineScan[]> {
  return call({ lines: [...lines] });
}
