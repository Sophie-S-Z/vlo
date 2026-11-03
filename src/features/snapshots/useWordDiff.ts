import { useEffect, useState } from 'react';
import type { DiffRequest } from './diffWorker';
import { wordDiff, type DiffPart } from './wordDiff';

/** Past this, Vlo stops and says the changes are too many to mark. Restore still works. */
export const DIFF_LIMIT_MS = 10_000;

export type DiffState =
  | { status: 'working' }
  | { status: 'done'; parts: DiffPart[] }
  | { status: 'too-many' }
  | { status: 'failed' };

/**
 * The word changes between two texts, worked out in a Web Worker. A new pair stops the old work at once.
 * Without Worker support (as in unit tests) it runs on the main thread with a short limit.
 */
export function useWordDiff(before: string | null, after: string): DiffState {
  const [result, setResult] = useState<{ before: string; after: string; state: DiffState } | null>(null);

  useEffect(() => {
    if (before === null) return;
    const finish = (parts: DiffPart[] | null) => {
      setResult({ before, after, state: parts ? { status: 'done', parts } : { status: 'too-many' } });
    };
    if (typeof Worker === 'undefined') {
      const timer = setTimeout(() => {
        finish(wordDiff(before, after, { timeoutMs: 500 }));
      }, 0);
      return () => {
        clearTimeout(timer);
      };
    }
    const worker = new Worker(new URL('./diffWorker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (event: MessageEvent<DiffPart[] | null>) => {
      finish(event.data);
      worker.terminate();
    };
    worker.onerror = () => {
      setResult({ before, after, state: { status: 'failed' } });
      worker.terminate();
    };
    const request: DiffRequest = { before, after, timeoutMs: DIFF_LIMIT_MS };
    worker.postMessage(request);
    return () => {
      worker.terminate();
    };
  }, [before, after]);

  if (result?.before === before && result.after === after) return result.state;
  return { status: 'working' };
}
