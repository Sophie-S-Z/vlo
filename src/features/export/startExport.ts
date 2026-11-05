import { downloadBytes } from '@/lib/download';
import type { NameCheck } from '@/lib/privacy';
import { readItemUpdate } from '@/lib/ydocs';
import { scopeItems } from './build';
import { localFontName } from '@/features/editor/format/fonts';
import type { ExportMessage, ExportResponse } from './export.worker';
import type { FontSwap } from './fontCheck';
import type { ExportFile, ExportRequest } from './run';

/*
 * The main-thread side of an export. It reads each item's stored Yjs document, which only the page can
 * open, and hands the rest to the export worker.
 */

/** Items read at the same time, so a long book does not open hundreds of databases at once. */
const READ_AT_ONCE = 6;

/** The stored update of each item that the export holds. */
export async function readUpdates(request: Omit<ExportRequest, 'updates'>): Promise<[string, Uint8Array][]> {
  const ids = scopeItems(request.items, request.scope)
    .map((n) => n.item)
    .filter((item) => item.kind !== 'part' && item.kind !== 'chapter')
    .map((item) => item.id);
  const out: [string, Uint8Array][] = [];
  for (let i = 0; i < ids.length; i += READ_AT_ONCE) {
    const batch = ids.slice(i, i + READ_AT_ONCE);
    const updates = await Promise.all(batch.map(readItemUpdate));
    batch.forEach((id, j) => {
      const update = updates[j];
      if (update) out.push([id, update]);
    });
  }
  return out;
}

/**
 * One export in the export worker, step by step: prepare, check the writer's own fonts, make the file.
 * The dialog asks about font swaps between the check and the file.
 */
export class ExportJob {
  private readonly worker: Worker;
  private waiting: { resolve: (response: ExportResponse) => void; reject: (error: Error) => void } | null =
    null;

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
    return new Promise((resolve, reject) => {
      this.waiting = { resolve, reject };
      this.worker.postMessage(message, transfer);
    });
  }

  /** Reads the items and prepares the export. The result lists the own fonts that the file needs. */
  static async start(
    request: Omit<ExportRequest, 'updates'>,
  ): Promise<{ job: ExportJob; ownFonts: string[]; names: NameCheck }> {
    const updates = await readUpdates(request);
    const job = new ExportJob();
    // Each buffer moves to the worker once, without a copy. Two updates may share one buffer.
    const buffers = new Set(updates.map(([, update]) => update.buffer as ArrayBuffer));
    try {
      const response = await job.send({ type: 'prepare', request: { ...request, updates } }, [...buffers]);
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

  /** Makes the file. */
  async make(): Promise<ExportFile> {
    const response = await this.send({ type: 'make' });
    if (response.type !== 'file') throw new Error('The export worker sent no file.');
    return response.file;
  }

  close(): void {
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
