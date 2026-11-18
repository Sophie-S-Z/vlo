import { workerCaller } from '@/lib/workerCall';
import type { AiReport } from './ai/detect';
import type { AnalysisProtocol } from './analysis.worker';
import type { MatchOptions, OriginalityReport, Source } from './originality/match';
import type { FullStats } from './stats';
import type { EditorForm } from '@/features/library/templates';

/*
 * One analysis worker for the tab. It starts with the first request, so a writer who never looks at the
 * statistics never loads it.
 */

const ask = workerCaller<AnalysisProtocol>(
  () => new Worker(new URL('./analysis.worker.ts', import.meta.url), { type: 'module' }),
  'The analysis stopped.',
);

export function statsInWorker(text: string, kind: EditorForm, language?: string): Promise<FullStats> {
  return ask({ type: 'stats', text, kind, language }) as Promise<FullStats>;
}

export function aiCheckInWorker(text: string): Promise<AiReport> {
  return ask({ type: 'ai', text }) as Promise<AiReport>;
}

export function originalityInWorker(
  text: string,
  sources: Source[],
  options: MatchOptions,
): Promise<OriginalityReport> {
  return ask({ type: 'originality', text, sources, options }) as Promise<OriginalityReport>;
}
