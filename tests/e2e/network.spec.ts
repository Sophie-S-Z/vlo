import { expect, test, type Page } from '@playwright/test';
import { seriousIssues } from './support/axe';
import { skipOnboarding } from './support/onboarding';
import { openView } from './support/views';

/*
 * Plan Task D1: the network log (spec section 10, F25, US09). A Pen mode session of typing, search, export,
 * views and a backup sends no request off the app, and the log page says 0. A seeded log shows its rows,
 * filters by purpose, and clears with an Undo.
 */

const views = (page: Page) => page.getByRole('navigation', { name: 'Project views' });
const count = (page: Page) => page.getByTestId('network-count');

async function newNovel(page: Page) {
  await skipOnboarding(page);
  await page.getByRole('button', { name: 'New project' }).click();
  await page
    .getByRole('dialog', { name: 'New project' })
    .getByRole('button', { name: 'Create project' })
    .click();
  await expect(page.getByRole('textbox', { name: 'Scene 1' })).toBeFocused();
}

/** Writes log rows straight into Vlo's IndexedDB. The page must already have opened the database. */
async function seedLog(page: Page) {
  await page.evaluate(async () => {
    const now = Date.now();
    const rows = [
      {
        id: 'log-1',
        at: now - 3000,
        host: 'openrouter.ai',
        path: '/api/v1/chat/completions',
        purpose: 'ai',
        bytesSent: 2048,
        status: 200,
      },
      {
        id: 'log-2',
        at: now - 2000,
        host: 'huggingface.co',
        path: '/mlc-ai/model/resolve/main/params.bin',
        purpose: 'model-download',
        bytesSent: 0,
        status: 200,
      },
      {
        id: 'log-3',
        at: now - 1000,
        host: 'api.groq.com',
        path: '/openai/v1/chat/completions',
        purpose: 'ai',
        bytesSent: 900,
        status: 'error',
      },
    ];
    await new Promise<void>((resolve, reject) => {
      const open = indexedDB.open('vlo');
      open.onerror = () => {
        reject(open.error ?? new Error('open failed'));
      };
      open.onsuccess = () => {
        const db = open.result;
        const tx = db.transaction('networkLog', 'readwrite');
        for (const row of rows) tx.objectStore('networkLog').put(row);
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onerror = () => {
          reject(tx.error ?? new Error('write failed'));
        };
      };
    });
  });
}

test('US09: a 60 second Pen session sends no request off the app, and the log says 0', async ({
  page,
  baseURL,
}) => {
  test.setTimeout(150_000);
  const outside: string[] = [];
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (
      url.protocol !== 'blob:' &&
      url.protocol !== 'data:' &&
      url.origin !== new URL(baseURL ?? '/').origin
    ) {
      outside.push(request.url());
    }
  });
  const started = Date.now();

  await newNovel(page);
  await page.keyboard.type('The tide came in over the stones, and Mira counted the boats again.', {
    delay: 15,
  });
  await expect(page.getByText('13 words', { exact: true })).toBeVisible();

  await page.keyboard.press('ControlOrMeta+f');
  const find = page.getByRole('search', { name: 'Find and replace' });
  await find.getByRole('textbox', { name: 'Find' }).fill('boats');
  await expect(find.getByRole('status').first()).toContainText('1');
  await page.keyboard.press('Escape');

  await page.getByRole('button', { name: 'Export' }).click();
  const dialog = page.getByRole('dialog', { name: 'Export' });
  const download = page.waitForEvent('download');
  await dialog.getByRole('button', { name: 'Export', exact: true }).click();
  expect((await download).suggestedFilename()).toBe('Scene 1.docx');
  await page.keyboard.press('Escape');

  for (const view of ['Board', 'Plot Grid', 'Submissions', 'Progress', 'Write']) {
    await openView(page, view);
    await expect(views(page).getByRole('link', { name: view, exact: true })).toHaveAttribute(
      'aria-current',
      'page',
    );
  }
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Library' }).click();
  // The binder has its own "Options for" buttons, so wait until the Library shows.
  await expect(page.getByRole('heading', { level: 1, name: 'Library' })).toBeVisible();
  await page.getByRole('button', { name: /^Options for / }).click();
  await page.getByRole('menuitem', { name: 'Back up' }).click();
  const backup = page.waitForEvent('download');
  await page
    .getByRole('dialog', { name: /^Back up / })
    .getByRole('button', { name: 'Download backup' })
    .click();
  expect((await backup).suggestedFilename()).toMatch(/\.vlo\.zip$/);
  await page.keyboard.press('Escape');
  await page.getByRole('list', { name: 'Projects' }).getByRole('link').first().click();
  await page.getByRole('textbox', { name: 'Scene 1' }).click();
  await page.keyboard.press('End');
  await page.keyboard.type(' The last one came home late.', { delay: 15 });

  // The Help and Privacy pages send nothing either.
  for (const name of ['Help', 'Privacy']) {
    await page.getByRole('contentinfo').getByRole('link', { name }).click();
    await expect(page.getByRole('heading', { level: 1, name })).toBeVisible();
  }

  // The session lasts at least 60 seconds, as US09 asks.
  const rest = 60_000 - (Date.now() - started);
  if (rest > 0) await page.waitForTimeout(rest);

  await page.getByRole('contentinfo').getByRole('link', { name: 'See the network log' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Network log' })).toBeVisible();
  await expect(count(page)).toHaveText('0 requests. Your project is in Pen mode, so Vlo sends nothing.');
  await expect(page.getByRole('table')).toHaveCount(0);
  expect(outside).toEqual([]);
  // Pen mode never loads the AI code.
  const scripts = await page.evaluate(() =>
    performance.getEntriesByType('resource').map((entry) => new URL(entry.name).pathname),
  );
  expect(scripts.filter((path) => /webllm|assistant|provider/i.test(path))).toEqual([]);
});

test('the log shows its rows newest first, filters by purpose, and clears with an Undo', async ({ page }) => {
  await skipOnboarding(page);
  await page.goto('/network');
  await expect(count(page)).toHaveText('0 requests. This device has no project yet.');
  await seedLog(page);
  await page.reload();

  await expect(count(page)).toContainText('3 requests.');
  const rows = page.getByRole('table').locator('tbody tr');
  await expect(rows).toHaveCount(3);
  await expect(rows.nth(0)).toContainText('api.groq.com/openai/v1/chat/completions');
  await expect(rows.nth(0)).toContainText('No answer');
  await expect(rows.nth(1)).toContainText('Model download');
  await expect(rows.nth(2)).toContainText('2 KB');
  await expect(rows.nth(2)).toContainText('HTTP 200');
  expect(await seriousIssues(page)).toEqual([]);

  await page.getByLabel('Show').selectOption('model-download');
  await expect(rows).toHaveCount(1);
  await expect(rows.nth(0)).toContainText('huggingface.co');
  await page.getByLabel('Show').selectOption('share');
  await expect(rows).toHaveCount(0);
  await expect(page.getByText('No request of this kind is in the log.')).toBeVisible();
  await page.getByLabel('Show').selectOption('all');

  await page.getByRole('button', { name: 'Clear log' }).click();
  await expect(page.getByRole('main').getByRole('status')).toHaveText('Cleared 3 log entries.');
  await expect(count(page)).toContainText('0 requests.');
  await expect(page.getByRole('table')).toHaveCount(0);
  const undo = page.getByRole('button', { name: 'Undo' });
  await expect(undo).toBeFocused();
  await undo.click();
  await expect(page.getByRole('main').getByRole('status')).toHaveText('Restored 3 log entries.');
  await expect(rows).toHaveCount(3);

  await page.reload();
  await expect(count(page)).toContainText('3 requests.');
});

test('the log page fits a 360 px screen', async ({ page }) => {
  await skipOnboarding(page);
  await page.goto('/network');
  await seedLog(page);
  await page.setViewportSize({ width: 360, height: 740 });
  await page.reload();
  await expect(count(page)).toContainText('3 requests.');
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
  expect(await seriousIssues(page)).toEqual([]);
});
