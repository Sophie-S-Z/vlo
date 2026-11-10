/// <reference lib="webworker" />
import type { BookSettings } from '@/lib/db';
import type { NameCheck } from '@/lib/privacy';
import type { FontCheck, FontSwap } from './fontCheck';
import type { LaidOutPdf } from './pdf/pdf';
import {
  checkFonts,
  makeExport,
  pdfOptions,
  prepareExport,
  type ExportFile,
  type ExportRequest,
  type PreparedExport,
} from './run';

/*
 * Builds export files off the main thread (spec section 9), so typing never waits for an export. One
 * worker serves one export in three steps: prepare the export tree, check the writer's own fonts against
 * their bytes, then make the file once the writer agrees to any font swap. The book preview (F51) lays
 * out the prepared text as book pages, again for each change of the book settings, and draws pages as SVG.
 * Its e-reader and phone previews get the book EPUB's XHTML and CSS as one page.
 */

export type ExportMessage =
  | { type: 'prepare'; request: ExportRequest }
  | { type: 'check'; fonts: [string, Uint8Array | null][] }
  | { type: 'make' }
  | { type: 'lay'; book: BookSettings }
  | { type: 'draw'; from: number; to: number }
  | { type: 'epub'; book: BookSettings; fontBase: string };

export type ExportResponse =
  | { type: 'prepared'; ownFonts: string[]; names: NameCheck }
  | { type: 'checked'; swaps: FontSwap[] }
  | { type: 'file'; file: ExportFile }
  | { type: 'laid'; pages: number; size: readonly [number, number] }
  | { type: 'drawn'; svgs: string[] }
  | { type: 'html'; html: string }
  | { type: 'error'; message: string };

declare const self: DedicatedWorkerGlobalScope;

let prepared: PreparedExport | null = null;
let fonts: FontCheck | undefined;
let laid: LaidOutPdf | null = null;

function reply(response: ExportResponse, transfer: Transferable[] = []): void {
  self.postMessage(response, transfer);
}

async function handle(message: ExportMessage): Promise<void> {
  if (message.type === 'prepare') {
    prepared = prepareExport(message.request);
    fonts = undefined;
    laid = null;
    reply({ type: 'prepared', ownFonts: prepared.ownFonts, names: prepared.names });
    return;
  }
  if (!prepared) throw new Error('The export has no prepared text.');
  if (message.type === 'check') {
    fonts = checkFonts(prepared, new Map(message.fonts));
    reply({ type: 'checked', swaps: fonts.swaps });
    return;
  }
  if (message.type === 'lay') {
    const [{ PDFDocument }, { layOutPdf }] = await Promise.all([import('pdf-lib'), import('./pdf/pdf')]);
    const options = pdfOptions(prepared, fonts ?? { own: new Map(), swaps: [] });
    laid = await layOutPdf({ ...prepared.doc, book: message.book }, options, await PDFDocument.create());
    reply({ type: 'laid', pages: laid.pages.length, size: laid.size });
    return;
  }
  if (message.type === 'draw') {
    if (!laid) throw new Error('The book has no pages yet.');
    const { svgPage } = await import('./pdf/svg');
    const svgs: string[] = [];
    for (let i = Math.max(0, message.from); i <= message.to && i < laid.pages.length; i += 1)
      svgs.push(svgPage(laid, i));
    reply({ type: 'drawn', svgs });
    return;
  }
  if (message.type === 'epub') {
    const { epubPreview } = await import('./epub');
    reply({
      type: 'html',
      html: await epubPreview({ ...prepared.doc, book: message.book }, message.fontBase),
    });
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
