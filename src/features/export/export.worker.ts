/// <reference lib="webworker" />
import type { ExportMessage, ExportResponse } from './exportWork';

/*
 * The entry of the export worker. Safari runs the entry module of a worker again when a lazy chunk
 * imports it, and that clears the prepared export between two steps. So the entry holds no code that
 * other chunks share: the work loads as a chunk of its own, and each message waits for it in order.
 */

declare const self: DedicatedWorkerGlobalScope;

const work = import('./exportWork');

self.onmessage = (event: MessageEvent<ExportMessage>) => {
  void work.then(
    ({ answer }) => answer(event.data),
    () => {
      const failed: ExportResponse = { type: 'error', message: 'The export code did not load.' };
      self.postMessage(failed);
    },
  );
};
