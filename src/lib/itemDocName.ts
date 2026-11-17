import { LIBRARY } from './library';

/* Item database names live apart from ydocs.ts, so code that only deletes text does not load Yjs. */

/** The database of an item's text in a library. Each library has its own, so no text goes between them. */
export function itemDocName(itemId: string, library = LIBRARY): string {
  return `${library}-item-${itemId}`;
}

/** Deletes an item's stored text. */
export async function deleteItemDoc(itemId: string, library = LIBRARY): Promise<void> {
  const name = itemDocName(itemId, library);
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(name);
    request.onsuccess = () => {
      resolve();
    };
    request.onerror = () => {
      reject(request.error ?? new Error(`Could not delete ${name}`));
    };
    // A blocked delete finishes once other tabs close the database. The writer does not need to wait.
    request.onblocked = () => {
      resolve();
    };
  });
}
