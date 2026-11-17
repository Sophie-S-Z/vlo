/// <reference lib="webworker" />
import { answerCalls, loadOnce } from '@/lib/workerCall';
import { lexiconOf, scanLines, type LineScan } from './scan';

/*
 * The Craft scan off the main thread (spec 8.3, plan Task C7), so typing never waits for it. The
 * pronouncing dictionary (about 1 MB gzip) loads with the first request only (plan decision D2).
 */

export interface CraftProtocol {
  request: { lines: string[] };
  result: LineScan[];
}

const load = loadOnce(() =>
  Promise.all([import('cmu-pronouncing-dictionary'), import('syllable')]).then(([cmu, count]) =>
    lexiconOf(cmu.dictionary, count.syllable),
  ),
);

answerCalls<CraftProtocol>(async ({ lines }) => scanLines(lines, await load()));
