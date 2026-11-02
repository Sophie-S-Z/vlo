/* Item database names live apart from ydocs.ts, so code that only deletes text does not load Yjs. */

export function itemDocName(itemId: string): string {
  return `vlo-item-${itemId}`;
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
