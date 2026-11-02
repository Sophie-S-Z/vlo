/// <reference lib="webworker" />
import { wordDiff } from './wordDiff';

/* Marks the changes between two texts off the main thread, so a large diff never freezes the page. */

export interface DiffRequest {
  before: string;
  after: string;
  timeoutMs: number;
}

declare const self: DedicatedWorkerGlobalScope;

self.onmessage = (event: MessageEvent<DiffRequest>) => {
  const { before, after, timeoutMs } = event.data;
  self.postMessage(wordDiff(before, after, { timeoutMs }));
};
