/// <reference lib="webworker" />
import type { FontCheck, FontSwap } from './fontCheck';
import {
  checkFonts,
  makeExport,
  prepareExport,
  type ExportFile,
  type ExportRequest,
  type PreparedExport,
} from './run';

/*
 * Builds export files off the main thread (spec section 9), so typing never waits for an export. One
 * worker serves one export in three steps: prepare the export tree, check the writer's own fonts against
 * their bytes, then make the file once the writer agrees to any font swap.
 */

export type ExportMessage =
  | { type: 'prepare'; request: ExportRequest }
  | { type: 'check'; fonts: [string, Uint8Array | null][] }
  | { type: 'make' };

export type ExportResponse =
  | { type: 'prepared'; ownFonts: string[] }
  | { type: 'checked'; swaps: FontSwap[] }
  | { type: 'file'; file: ExportFile }
  | { type: 'error'; message: string };

declare const self: DedicatedWorkerGlobalScope;

let prepared: PreparedExport | null = null;
let fonts: FontCheck | undefined;

function reply(response: ExportResponse, transfer: Transferable[] = []): void {
  self.postMessage(response, transfer);
}

async function handle(message: ExportMessage): Promise<void> {
  if (message.type === 'prepare') {
    prepared = prepareExport(message.request);
    fonts = undefined;
    reply({ type: 'prepared', ownFonts: prepared.ownFonts });
    return;
  }
  if (!prepared) throw new Error('The export has no prepared text.');
  if (message.type === 'check') {
    fonts = checkFonts(prepared, new Map(message.fonts));
    reply({ type: 'checked', swaps: fonts.swaps });
    return;
  }
  const file = await makeExport(prepared, fonts);
  reply({ type: 'file', file }, [file.bytes.buffer]);
}

self.onmessage = (event: MessageEvent<ExportMessage>) => {
  handle(event.data).catch((error: unknown) => {
    reply({ type: 'error', message: error instanceof Error ? error.message : String(error) });
  });
};
