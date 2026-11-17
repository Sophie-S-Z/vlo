import { workerCaller } from '@/lib/workerCall';
import type { Rhymes, ThesaurusEntry } from './thesaurus';
import type { ThesaurusProtocol } from './thesaurus.worker';

/*
 * One thesaurus worker for the tab. It starts with the first look-up, so a writer who never opens the
 * thesaurus never loads it or WordNet.
 */

const call = workerCaller<ThesaurusProtocol>(
  () => new Worker(new URL('./thesaurus.worker.ts', import.meta.url), { type: 'module' }),
  'The thesaurus did not load.',
);

/** The senses of a word, or null when the thesaurus lacks it. */
export function wordsFor(word: string): Promise<ThesaurusEntry | null> {
  return call({ kind: 'words', word }) as Promise<ThesaurusEntry | null>;
}

/** The rhymes of a word, or null when the pronouncing dictionary lacks it. */
export function rhymesOf(word: string): Promise<Rhymes | null> {
  return call({ kind: 'rhymes', word }) as Promise<Rhymes | null>;
}
