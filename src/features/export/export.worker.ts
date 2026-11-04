/// <reference lib="webworker" />
import { runExport, type ExportFile, type ExportRequest } from './run';

/* Builds export files off the main thread (spec section 9), so typing never waits for an export. */

export type ExportResponse = { ok: true; file: ExportFile } | { ok: false; message: string };

declare const self: DedicatedWorkerGlobalScope;

self.onmessage = (event: MessageEvent<ExportRequest>) => {
  runExport(event.data).then(
    (file) => {
      const response: ExportResponse = { ok: true, file };
      self.postMessage(response, [file.bytes.buffer]);
    },
    (error: unknown) => {
      const response: ExportResponse = {
        ok: false,
        message: error instanceof Error ? error.message : String(error),
      };
      self.postMessage(response);
    },
  );
};
