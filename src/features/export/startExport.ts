import { encodeDoc, openItemDoc } from '@/lib/ydocs';
import { scopeItems } from './build';
import type { ExportResponse } from './export.worker';
import type { ExportFile, ExportRequest } from './run';

/*
 * The main-thread side of an export. It reads each item's stored Yjs document, which only the page can
 * open, and hands the rest to the export worker.
 */

/** Items read at the same time, so a long book does not open hundreds of databases at once. */
const READ_AT_ONCE = 6;

async function readUpdate(itemId: string): Promise<Uint8Array> {
  const open = openItemDoc(itemId);
  try {
    await open.ready;
    return encodeDoc(open.doc);
  } finally {
    await open.close();
  }
}

/** The stored update of each item that the export holds. */
export async function readUpdates(request: Omit<ExportRequest, 'updates'>): Promise<[string, Uint8Array][]> {
  const ids = scopeItems(request.items, request.scope)
    .map((n) => n.item)
    .filter((item) => item.kind !== 'part' && item.kind !== 'chapter')
    .map((item) => item.id);
  const out: [string, Uint8Array][] = [];
  for (let i = 0; i < ids.length; i += READ_AT_ONCE) {
    const batch = ids.slice(i, i + READ_AT_ONCE);
    const updates = await Promise.all(batch.map(readUpdate));
    batch.forEach((id, j) => {
      const update = updates[j];
      if (update) out.push([id, update]);
    });
  }
  return out;
}

function inWorker(request: ExportRequest): Promise<ExportFile> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./export.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (event: MessageEvent<ExportResponse>) => {
      worker.terminate();
      if (event.data.ok) resolve(event.data.file);
      else reject(new Error(event.data.message));
    };
    worker.onerror = (event) => {
      worker.terminate();
      reject(new Error(event.message || 'The export worker stopped.'));
    };
    // Each buffer moves to the worker once, without a copy. Two updates may share one buffer.
    const buffers = new Set(request.updates.map(([, update]) => update.buffer as ArrayBuffer));
    worker.postMessage(request, [...buffers]);
  });
}

/** Reads the items and makes the file in the export worker. */
export async function startExport(request: Omit<ExportRequest, 'updates'>): Promise<ExportFile> {
  return inWorker({ ...request, updates: await readUpdates(request) });
}

/** Saves a file to the device's downloads through a link with a download name. */
export function saveFile(file: ExportFile): void {
  const url = URL.createObjectURL(new Blob([file.bytes as BlobPart], { type: file.type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = file.name;
  link.rel = 'noopener';
  document.body.append(link);
  link.click();
  link.remove();
  // The browser reads the file after the click returns, so the address stays valid a little longer.
  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 60_000);
}
