/// <reference lib="webworker" />
import { answerCalls, loadOnce } from '@/lib/workerCall';
import {
  lookUp,
  rhymeIndex,
  rhymesFor,
  type Rhymes,
  type ThesaurusData,
  type ThesaurusEntry,
} from './thesaurus';

/*
 * The thesaurus and the rhymes off the main thread (Phase 19, Task D2). The WordNet file (about 1.8 MB
 * gzip) loads with the first request, and the pronouncing dictionary with the first rhyme request. Both
 * are Vlo's own files, so nothing leaves the device.
 */

export interface ThesaurusProtocol {
  request: { kind: 'words' | 'rhymes'; word: string };
  result: ThesaurusEntry | Rhymes | null;
}

const loadData = loadOnce(async () => (await import('./thesaurus.json')).default as unknown as ThesaurusData);
const loadRhymes = loadOnce(async () => {
  const [data, cmu] = await Promise.all([loadData(), import('cmu-pronouncing-dictionary')]);
  return rhymeIndex(cmu.dictionary, data);
});

answerCalls<ThesaurusProtocol>(async (request) =>
  request.kind === 'words'
    ? lookUp(await loadData(), request.word)
    : rhymesFor(await loadRhymes(), request.word),
);
