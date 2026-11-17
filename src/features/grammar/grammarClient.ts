import type { GrammarRequest, GrammarResponse } from './grammar.worker';
import type { GrammarLint } from './lints';

/*
 * One grammar worker for the tab. It starts with the first check, so a writer who never turns the check on
 * never loads it or Harper.
 */

let worker: Worker | null = null;
let nextId = 0;
const waiting = new Map<
  number,
  { resolve: (blocks: GrammarLint[][]) => void; reject: (error: Error) => void }
>();

function start(): Worker {
  if (worker) return worker;
  const made = new Worker(new URL('./grammar.worker.ts', import.meta.url), { type: 'module' });
  made.onmessage = (event: MessageEvent<GrammarResponse>) => {
    const reply = event.data;
    const entry = waiting.get(reply.id);
    if (!entry) return;
    waiting.delete(reply.id);
    if ('error' in reply) entry.reject(new Error('The grammar checker did not load.'));
    else entry.resolve(reply.blocks);
  };
  made.onerror = () => {
    for (const entry of waiting.values()) entry.reject(new Error('The grammar worker stopped.'));
    waiting.clear();
    made.terminate();
    worker = null;
  };
  worker = made;
  return made;
}

/** Checks the text of each block in the worker. */
export function checkInWorker(blocks: readonly string[], dialect: number): Promise<GrammarLint[][]> {
  const id = (nextId += 1);
  return new Promise((resolve, reject) => {
    waiting.set(id, { resolve, reject });
    start().postMessage({ id, blocks: [...blocks], dialect } satisfies GrammarRequest);
  });
}
