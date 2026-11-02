import { IndexeddbPersistence } from 'y-indexeddb';
import * as Y from 'yjs';

/** The Yjs XML fragment that holds an item's text. TipTap's Collaboration extension reads the same field. */
export const YFRAGMENT = 'default';

export interface OpenItemDoc {
  doc: Y.Doc;
  persistence: IndexeddbPersistence;
  /** Resolves when the stored text is loaded into `doc`. */
  ready: Promise<void>;
  /** Waits for pending writes, then closes the database and frees the document. */
  close: () => Promise<void>;
}

export function itemDocName(itemId: string): string {
  return `vlo-item-${itemId}`;
}

export function openItemDoc(itemId: string): OpenItemDoc {
  const doc = new Y.Doc();
  const persistence = new IndexeddbPersistence(itemDocName(itemId), doc);
  const ready = persistence.whenSynced.then(() => undefined);
  return {
    doc,
    persistence,
    ready,
    close: async () => {
      await ready;
      await persistence.destroy();
      doc.destroy();
    },
  };
}

/** Deletes an item's stored text. */
export async function deleteItemDoc(itemId: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(itemDocName(itemId));
    request.onsuccess = () => {
      resolve();
    };
    request.onerror = () => {
      reject(request.error ?? new Error(`Could not delete ${itemDocName(itemId)}`));
    };
    // A blocked delete finishes once other tabs close the database. The writer does not need to wait.
    request.onblocked = () => {
      resolve();
    };
  });
}

export function encodeDoc(doc: Y.Doc): Uint8Array {
  return Y.encodeStateAsUpdate(doc);
}

export function docFromUpdate(update: Uint8Array): Y.Doc {
  const doc = new Y.Doc();
  Y.applyUpdate(doc, update);
  return doc;
}
