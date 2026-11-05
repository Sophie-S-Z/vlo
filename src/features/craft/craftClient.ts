import type { CraftRequest, CraftResponse } from './craft.worker';
import type { LineScan } from './scan';

/*
 * One Craft worker for the tab. It starts with the first scan, so a poet who never turns the labels on
 * never loads it or the dictionary.
 */

let worker: Worker | null = null;
let nextId = 0;
const waiting = new Map<number, { resolve: (lines: LineScan[]) => void; reject: (error: Error) => void }>();

function start(): Worker {
  if (worker) return worker;
  const made = new Worker(new URL('./craft.worker.ts', import.meta.url), { type: 'module' });
  made.onmessage = (event: MessageEvent<CraftResponse>) => {
    const reply = event.data;
    const entry = waiting.get(reply.id);
    if (!entry) return;
    waiting.delete(reply.id);
    if ('error' in reply) entry.reject(new Error('The pronouncing dictionary did not load.'));
    else entry.resolve(reply.lines);
  };
  made.onerror = () => {
    for (const entry of waiting.values()) entry.reject(new Error('The Craft worker stopped.'));
    waiting.clear();
    made.terminate();
    worker = null;
  };
  worker = made;
  return made;
}

/** Scans the lines of a poem in the worker. */
export function scanInWorker(lines: readonly string[]): Promise<LineScan[]> {
  const id = (nextId += 1);
  return new Promise((resolve, reject) => {
    waiting.set(id, { resolve, reject });
    start().postMessage({ id, lines: [...lines] } satisfies CraftRequest);
  });
}
