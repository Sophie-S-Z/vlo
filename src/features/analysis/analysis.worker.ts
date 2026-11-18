/// <reference lib="webworker" />
import { answerCalls, loadOnce } from '@/lib/workerCall';
import { checkAi, type AiReport } from './ai/detect';
import {
  checkOriginality,
  type MatchOptions,
  type OriginalityReport,
  type Source,
} from './originality/match';
import { fullStats, type FullStats } from './stats';
import type { EditorForm } from '@/features/library/templates';

/*
 * The analysis tools off the main thread, so typing never waits for them: the statistics, the AI check
 * and the originality check. The syllable counter loads with the first statistics request.
 */

export interface AnalysisProtocol {
  request:
    | { type: 'stats'; text: string; kind: EditorForm; language?: string | undefined }
    | { type: 'ai'; text: string }
    | { type: 'originality'; text: string; sources: Source[]; options: MatchOptions };
  result: FullStats | AiReport | OriginalityReport;
}

const loadSyllables = loadOnce(async () => (await import('syllable')).syllable);

answerCalls<AnalysisProtocol>(async (request) => {
  if (request.type === 'stats')
    return fullStats(request.text, request.kind, await loadSyllables(), request.language);
  if (request.type === 'ai') return checkAi(request.text);
  return checkOriginality(request.text, request.sources, request.options);
});
