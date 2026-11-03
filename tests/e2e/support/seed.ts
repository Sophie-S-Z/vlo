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
            template: (['novel', 'memoir', 'poetry'] as const)[i % 3],
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
