import { downloadBytes } from '@/lib/download';
import type { BookSettings } from '@/lib/db';
import type { NameCheck } from '@/lib/privacy';
import { holdsText } from '@/features/library/templates';
import { db } from '@/lib/db';
import { readItemUpdates } from '@/lib/ydocs';
import { imageIdsIn } from '@/features/images/images';
import type { ExportImage } from './model';
import { scopeItems } from './build';
import { localFontName } from '@/features/editor/format/fonts';
import type { ExportMessage, ExportResponse } from './export.worker';
import type { FontSwap } from './fontCheck';
import type { ExportFile, ExportRequest } from './run';

/*
 * The main-thread side of an export. It reads each item's stored Yjs document, which only the page can
 * open, and hands the rest to the export worker.
 */

/** The stored update of each item that the export holds. */
export async function readUpdates(request: Omit<ExportRequest, 'updates'>): Promise<[string, Uint8Array][]> {
  // A plain text, such as a packet's cover letter, reads no item.
  if (request.text) return [];
  const ids = scopeItems(request.items, request.scope)
    .map((n) => n.item)
    .filter((item) => holdsText(request.project.templates, item.kind))
    .map((item) => item.id);
  return readItemUpdates(ids);
}

/** The stored copy of each image that the items' text holds (Phase 16). A lost row stays out. */
export async function readImages(updates: readonly [string, Uint8Array][]): Promise<[string, ExportImage][]> {
  const ids = new Set<string>();
  for (const [, update] of updates) imageIdsIn(update, ids);
  if (ids.size === 0) return [];
  const rows = await db.images.bulkGet([...ids]);
  const out: [string, ExportImage][] = [];
  for (const row of rows) {
    if (!row || (row.type !== 'image/jpeg' && row.type !== 'image/png')) continue;
    out.push([
      row.id,
      {
        type: row.type,
        width: row.width,
        height: row.height,
        data: new Uint8Array(await row.data.arrayBuffer()),
      },
    ]);
  }
  return out;
}

/**
 * One export in the export worker, step by step: prepare, check the writer's own fonts, make the file.
 * The dialog asks about font swaps between the check and the file. Each step waits for the one before it,
 * so two callers never mix their answers, and the worker runs one step at a time.
 */
export class ExportJob {
  private readonly worker: Worker;
  private waiting: { resolve: (response: ExportResponse) => void; reject: (error: Error) => void } | null =
    null;
  private queue: Promise<unknown> = Promise.resolve();
  private closed = false;

  private constructor() {
    this.worker = new Worker(new URL('./export.worker.ts', import.meta.url), { type: 'module' });
    this.worker.onmessage = (event: MessageEvent<ExportResponse>) => {
      const waiting = this.waiting;
      this.waiting = null;
      if (event.data.type === 'error') waiting?.reject(new Error(event.data.message));
      else waiting?.resolve(event.data);
    };
    this.worker.onerror = (event) => {
      const waiting = this.waiting;
      this.waiting = null;
      waiting?.reject(new Error(event.message || 'The export worker stopped.'));
    };
  }

  private send(message: ExportMessage, transfer: Transferable[] = []): Promise<ExportResponse> {
    const step = () =>
      new Promise<ExportResponse>((resolve, reject) => {
        if (this.closed) {
          reject(new Error('The export stopped.'));
          return;
        }
        this.waiting = { resolve, reject };
        this.worker.postMessage(message, transfer);
      });
    const next = this.queue.then(step, step);
    this.queue = next.catch(() => undefined);
    return next;
  }

  /** Reads the items and prepares the export. The result lists the own fonts that the file needs. */
  static async start(
    request: Omit<ExportRequest, 'updates'>,
  ): Promise<{ job: ExportJob; ownFonts: string[]; names: NameCheck }> {
    const updates = await readUpdates(request);
    const images = await readImages(updates);
    const job = new ExportJob();
    // Each buffer moves to the worker once, without a copy. Two updates may share one buffer.
    const buffers = new Set([
      ...updates.map(([, update]) => update.buffer as ArrayBuffer),
      ...images.map(([, image]) => image.data.buffer as ArrayBuffer),
    ]);
    try {
      const response = await job.send({ type: 'prepare', request: { ...request, updates, images } }, [
        ...buffers,
      ]);
      return response.type === 'prepared'
        ? { job, ownFonts: response.ownFonts, names: response.names }
        : { job, ownFonts: [], names: { unmarked: [], changed: [] } };
    } catch (error) {
      job.close();
      throw error;
    }
  }

  /** Checks the own fonts against their files, and lists each font that needs a stand-in. */
  async check(fonts: ReadonlyMap<string, Uint8Array | null>): Promise<FontSwap[]> {
    const response = await this.send({ type: 'check', fonts: [...fonts] });
    return response.type === 'checked' ? response.swaps : [];
  }

  /** Lays out the prepared text as a book, for the preview. The result is the page count and size. */
  async lay(book: BookSettings): Promise<{ pages: number; size: readonly [number, number] }> {
    const response = await this.send({ type: 'lay', book });
    if (response.type !== 'laid') throw new Error('The export worker laid out no pages.');
    return response;
  }

  /** The pages from `from` to `to` of the book laid out last, as SVG files. */
  async draw(from: number, to: number): Promise<string[]> {
    const response = await this.send({ type: 'draw', from, to });
    if (response.type !== 'drawn') throw new Error('The export worker drew no pages.');
    return response.svgs;
  }

  /** The book's EPUB text and style as one page, for the e-reader and phone previews. */
  async epub(book: BookSettings, fontBase: string): Promise<string> {
    const response = await this.send({ type: 'epub', book, fontBase });
    if (response.type !== 'html') throw new Error('The export worker made no preview.');
    return response.html;
  }

  /** Makes the file. */
  async make(): Promise<ExportFile> {
    const response = await this.send({ type: 'make' });
    if (response.type !== 'file') throw new Error('The export worker sent no file.');
    return response.file;
  }

  close(): void {
    this.closed = true;
    this.worker.terminate();
    this.waiting?.reject(new Error('The export stopped.'));
    this.waiting = null;
  }
}

/** The bytes of each own font, or null for a font Vlo cannot read on this device. */
export async function readOwnFonts(values: readonly string[]): Promise<Map<string, Uint8Array | null>> {
  const out = new Map<string, Uint8Array | null>();
  if (values.length === 0) return out;
  const { readInstalledFont } = await import('@/features/editor/format/ownFonts');
  for (const value of values) out.set(value, await readInstalledFont(localFontName(value) ?? value));
  return out;
}

/** Saves a file to the device's downloads. */
export function saveFile(file: ExportFile): void {
  downloadBytes(file.name, file.type, file.bytes);
}
