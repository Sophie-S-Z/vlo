import { IndexeddbPersistence, storeState } from 'y-indexeddb';
import * as Y from 'yjs';
import { itemDocName } from './itemDocName';

/** The Yjs XML fragment that holds an item's text. TipTap's Collaboration extension reads the same field. */
export const YFRAGMENT = 'default';

export interface OpenItemDoc {
  doc: Y.Doc;
  persistence: IndexeddbPersistence;
  /** Resolves when the stored text is loaded into `doc`. Rejects if the database cannot open. */
  ready: Promise<void>;
  /**
   * Resolves once IndexedDB holds everything in `doc`. Rejects with the browser's error, such as
   * QuotaExceededError, when a write failed and the retry also fails.
   */
  confirmSaved: (now: number) => Promise<void>;
  /** Waits for pending writes, then closes the database and frees the document. */
  close: () => Promise<void>;
}

/** Never settles. Used so a race ends only by rejection on this side. */
const forever = new Promise<never>(() => undefined);

export function openItemDoc(itemId: string): OpenItemDoc {
  const doc = new Y.Doc();
  const persistence = new IndexeddbPersistence(itemDocName(itemId), doc);
  // y-indexeddb never rejects whenSynced, so a failed open would wait forever. Race it with the open.
  const ready = Promise.race([
    persistence.whenSynced.then(() => undefined),
    persistence._db.then(() => forever),
  ]);

  // y-indexeddb drops the result of each update write. A failed write's error and abort events bubble
  // from its transaction to the database, so Vlo listens there.
  let failed: Error | null = null;
  const onFailure = (event: Event) => {
    const target = event.target as IDBRequest | IDBTransaction | null;
    failed = target?.error ?? new Error('Vlo could not save.');
  };
  // A function, so the type checker does not assume the value stays as the last assignment made it.
  const failure = (): Error | null => failed;
  void persistence._db.then(
    (db) => {
      db.addEventListener('error', onFailure);
      db.addEventListener('abort', onFailure);
    },
    () => undefined,
  );

  return {
    doc,
    persistence,
    ready,
    confirmSaved: async (now) => {
      if (failure() !== null) {
        // An update was lost, and later updates depend on it. Store the whole document again.
        failed = null;
        await storeState(persistence, true);
        const again = failure();
        if (again) throw again;
      }
      await markSaved(persistence, now);
      const last = failure();
      if (last) throw last;
    },
    close: async () => {
      await ready.catch(() => undefined);
      await persistence.destroy().catch(() => undefined);
      doc.destroy();
    },
  };
}

/**
 * Writes a mark in a transaction that also covers the updates store, so IndexedDB runs it after every
 * earlier update write. It resolves when those writes have finished.
 */
function markSaved(persistence: IndexeddbPersistence, now: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const db = persistence.db;
    if (!db) {
      reject(new Error('The item database is not open.'));
      return;
    }
    const tx = db.transaction(['updates', 'custom'], 'readwrite');
    tx.objectStore('custom').put(now, 'vlo:savedAt');
    tx.oncomplete = () => {
      resolve();
    };
    const fail = () => {
      reject(tx.error ?? new Error('Vlo could not save.'));
    };
    tx.onerror = fail;
    tx.onabort = fail;
  });
}

/** The stored text of an item, as one Yjs update. An item with no stored text gives an empty document. */
export async function readItemUpdate(itemId: string): Promise<Uint8Array> {
  const open = openItemDoc(itemId);
  try {
    await open.ready;
    return encodeDoc(open.doc);
  } finally {
    await open.close();
  }
}

/** Item databases opened at the same time, so a long book does not open hundreds at once. */
export const READ_AT_ONCE = 6;

/** The stored text of each item, as one Yjs update each, in the order of `itemIds`. */
export async function readItemUpdates(itemIds: readonly string[]): Promise<[string, Uint8Array][]> {
  const out: [string, Uint8Array][] = [];
  for (let i = 0; i < itemIds.length; i += READ_AT_ONCE) {
    const batch = itemIds.slice(i, i + READ_AT_ONCE);
    const updates = await Promise.all(batch.map(readItemUpdate));
    batch.forEach((id, j) => {
      const update = updates[j];
      if (update) out.push([id, update]);
    });
  }
  return out;
}

/** Stores a Yjs update as an item's text, and resolves when IndexedDB holds it. */
export async function writeItemUpdate(itemId: string, update: Uint8Array, now: number): Promise<void> {
  const open = openItemDoc(itemId);
  try {
    await open.ready;
    Y.applyUpdate(open.doc, update);
    await open.confirmSaved(now);
  } finally {
    await open.close();
  }
}

export function encodeDoc(doc: Y.Doc): Uint8Array {
  return Y.encodeStateAsUpdate(doc);
}

export function docFromUpdate(update: Uint8Array): Y.Doc {
  const doc = new Y.Doc();
  Y.applyUpdate(doc, update);
  return doc;
}
