import type { AiReport } from './ai/detect';
import type { AnalysisRequest, AnalysisResponse, AnalysisResult } from './analysis.worker';
import type { MatchOptions, OriginalityReport, Source } from './originality/match';
import type { FullStats } from './stats';
import type { EditorForm } from '@/features/library/templates';

/*
 * One analysis worker for the tab. It starts with the first request, so a writer who never looks at the
 * statistics never loads it.
 */

type Body = AnalysisRequest extends infer R ? (R extends AnalysisRequest ? Omit<R, 'id'> : never) : never;

let worker: Worker | null = null;
let nextId = 0;
const waiting = new Map<
  number,
  { resolve: (result: AnalysisResult) => void; reject: (error: Error) => void }
>();

function start(): Worker {
  if (worker) return worker;
  const made = new Worker(new URL('./analysis.worker.ts', import.meta.url), { type: 'module' });
  made.onmessage = (event: MessageEvent<AnalysisResponse>) => {
    const reply = event.data;
    const entry = waiting.get(reply.id);
    if (!entry) return;
    waiting.delete(reply.id);
    if ('error' in reply) entry.reject(new Error(reply.error));
    else entry.resolve(reply.result);
  };
  made.onerror = () => {
    for (const entry of waiting.values()) entry.reject(new Error('The analysis worker stopped.'));
    waiting.clear();
    made.terminate();
    worker = null;
  };
  worker = made;
  return made;
}

function ask(body: Body): Promise<AnalysisResult> {
  const id = (nextId += 1);
  return new Promise((resolve, reject) => {
    waiting.set(id, { resolve, reject });
    start().postMessage({ ...body, id });
  });
}

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
