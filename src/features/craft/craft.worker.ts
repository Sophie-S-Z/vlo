/// <reference lib="webworker" />
import { lexiconOf, scanLines, type Lexicon, type LineScan } from './scan';

/*
 * The Craft scan off the main thread (spec 8.3, plan Task C7), so typing never waits for it. The
 * pronouncing dictionary (about 1 MB gzip) loads with the first request only (plan decision D2).
 */

export interface CraftRequest {
  id: number;
  lines: string[];
}

export type CraftResponse = { id: number; lines: LineScan[] } | { id: number; error: true };

declare const self: DedicatedWorkerGlobalScope;

let lexicon: Promise<Lexicon> | null = null;

function load(): Promise<Lexicon> {
  lexicon ??= Promise.all([import('cmu-pronouncing-dictionary'), import('syllable')]).then(([cmu, count]) =>
    lexiconOf(cmu.dictionary, count.syllable),
  );
  return lexicon;
}

self.onmessage = (event: MessageEvent<CraftRequest>) => {
  const { id, lines } = event.data;
  load().then(
    (words) => {
      self.postMessage({ id, lines: scanLines(lines, words) } satisfies CraftResponse);
    },
    () => {
      // The next request tries the download again, such as after the device goes online.
      lexicon = null;
      self.postMessage({ id, error: true } satisfies CraftResponse);
    },
  );
};
