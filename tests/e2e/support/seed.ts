import type { Page } from '@playwright/test';

/**
 * Writes `count` empty projects straight into Vlo's IndexedDB, then reloads so the Library shows them.
 * The page must already have opened the database (any Vlo route does).
 */
export async function seedProjects(page: Page, count: number): Promise<void> {
  await page.evaluate(async (n) => {
    await new Promise<void>((resolve, reject) => {
      const open = indexedDB.open('vlo');
      open.onerror = () => {
        reject(open.error ?? new Error('open failed'));
      };
      open.onsuccess = () => {
        const db = open.result;
        const tx = db.transaction('projects', 'readwrite');
        const now = Date.now();
        for (let i = 0; i < n; i += 1) {
          tx.objectStore('projects').put({
            id: `seed-${String(i)}`,
            title: `Seeded project ${String(i + 1)}`,
            templates: [(['novel', 'memoir', 'poetry'] as const)[i % 3]],
            aiMode: 'pen',
            createdAt: now - i * 1000,
            updatedAt: now - i * 1000,
            settings: {
              snapshotEveryMinutes: 10,
              aliasAiRequests: false,
              streaksEnabled: false,
              restDays: [],
            },
          });
        }
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onerror = () => {
          reject(tx.error ?? new Error('write failed'));
        };
      };
    });
  }, count);
  await page.reload();
}

/** Moves the creation time of every project `age` milliseconds into the past. */
export async function ageProjects(page: Page, age: number) {
  await page.evaluate(async (ms) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('vlo');
      request.onsuccess = () => {
        resolve(request.result);
      };
      request.onerror = () => {
        reject(request.error ?? new Error('open failed'));
      };
    });
    await new Promise<void>((resolve, reject) => {
      const store = db.transaction('projects', 'readwrite').objectStore('projects');
      const all = store.getAll();
      all.onsuccess = () => {
        for (const project of all.result as { createdAt: number }[])
          store.put({ ...project, createdAt: Date.now() - ms });
        store.transaction.oncomplete = () => {
          resolve();
        };
      };
      all.onerror = () => {
        reject(all.error ?? new Error('read failed'));
      };
    });
    db.close();
  }, age);
}
