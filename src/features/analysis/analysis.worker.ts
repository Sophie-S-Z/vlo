/// <reference lib="webworker" />
import { checkAi, type AiReport } from './ai/detect';
import {
  checkOriginality,
  type MatchOptions,
  type OriginalityReport,
  type Source,
} from './originality/match';
import { fullStats, type FullStats } from './stats';

/*
 * The analysis tools off the main thread, so typing never waits for them: the statistics, the AI check
 * and the originality check. The syllable counter loads with the first statistics request.
 */

export type AnalysisRequest =
  | { id: number; type: 'stats'; text: string; kind: 'prose' | 'poem' }
  | { id: number; type: 'ai'; text: string }
  | { id: number; type: 'originality'; text: string; sources: Source[]; options: MatchOptions };

export type AnalysisResult = FullStats | AiReport | OriginalityReport;

export type AnalysisResponse = { id: number; result: AnalysisResult } | { id: number; error: string };

declare const self: DedicatedWorkerGlobalScope;

let syllables: Promise<(word: string) => number> | null = null;

async function run(request: AnalysisRequest): Promise<AnalysisResult> {
  if (request.type === 'stats') {
    syllables ??= import('syllable').then((module) => module.syllable);
    return fullStats(request.text, request.kind, await syllables);
  }
  if (request.type === 'ai') return checkAi(request.text);
  return checkOriginality(request.text, request.sources, request.options);
}

self.onmessage = (event: MessageEvent<AnalysisRequest>) => {
  const request = event.data;
  run(request).then(
    (result) => {
      self.postMessage({ id: request.id, result } satisfies AnalysisResponse);
    },
    (problem: unknown) => {
      if (request.type === 'stats') syllables = null;
      self.postMessage({
        id: request.id,
        error: problem instanceof Error ? problem.message : 'The analysis stopped.',
      } satisfies AnalysisResponse);
    },
  );
};
