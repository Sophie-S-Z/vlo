import { expect, test, type Page, type Route } from '@playwright/test';
import { seriousIssues } from './support/axe';
import { skipOnboarding, writeWithoutAccount } from './support/onboarding';
import { seedProjects } from './support/seed';

// A signed-out visit opens on the sign-in screen; these tests write with no account.
test.beforeEach(async ({ page }) => {
  await writeWithoutAccount(page);
});

/* Plan Task E5 (spec F30): usage counts are always on, and Vlo sends each weekly report by itself. */

// Playwright routes the fake Supabase requests only in Chromium once the service worker controls the
// page, so these tests run with no service worker. The PWA tests cover the worker.
test.use({ serviceWorkers: 'block' });

const RPC = 'https://vlo-test.supabase.co/rest/v1/rpc/';
const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'POST, OPTIONS',
  'access-control-allow-headers': 'apikey, authorization, content-type',
};

async function fakeSupabase(page: Page): Promise<{ name: string; body: Record<string, unknown> }[]> {
  const calls: { name: string; body: Record<string, unknown> }[] = [];
  await page.route(`${RPC}*`, async (route: Route) => {
    if (route.request().method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers: CORS });
      return;
    }
    calls.push({
      name: new URL(route.request().url()).pathname.split('/').at(-1) ?? '',
      body: route.request().postDataJSON() as Record<string, unknown>,
    });
    await route.fulfill({
      status: 200,
      headers: { ...CORS, 'content-type': 'application/json' },
      body: JSON.stringify('report-id'),
    });
  });
  return calls;
}

/** The week before counts started on this device, once the first check marks it. */
async function startWeek(page: Page): Promise<string | undefined> {
  return page.evaluate(
    () =>
      new Promise<string | undefined>((resolve, reject) => {
        const open = indexedDB.open('vlo');
        open.onerror = () => {
          reject(open.error ?? new Error('open failed'));
        };
        open.onsuccess = () => {
          const db = open.result;
          const read = db.transaction('appMeta').objectStore('appMeta').get('usage');
          read.onsuccess = () => {
            db.close();
            resolve((read.result as { value: { handledWeek?: string } } | undefined)?.value.handledWeek);
          };
          read.onerror = () => {
            db.close();
            reject(read.error ?? new Error('read failed'));
          };
        };
      }),
  );
}

/** A writing session 7 days ago, and counts that started long before it. */
async function lastWeekWithWriting(page: Page) {
  await page.evaluate(async () => {
    await new Promise<void>((resolve, reject) => {
      const open = indexedDB.open('vlo');
      open.onerror = () => {
        reject(open.error ?? new Error('open failed'));
      };
      open.onsuccess = () => {
        const db = open.result;
        const tx = db.transaction(['sessions', 'appMeta'], 'readwrite');
        const at = Date.now() - 7 * 86_400_000;
        tx.objectStore('sessions').put({
          id: 'seed-session',
          projectId: 'seed-0',
          startedAt: at,
          endedAt: at + 60_000,
          wordsAdded: 1200,
          poemsAdded: 0,
        });
        tx.objectStore('appMeta').put({ key: 'usage', value: { handledWeek: '2000-W01', weeks: {} } });
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

test('Settings says what each count sends, with no switch', async ({ page }) => {
  await fakeSupabase(page);
  await skipOnboarding(page);
  await page.goto('/settings');
  const usage = page
    .locator('section')
    .filter({ has: page.getByRole('heading', { level: 2, name: 'Usage counts' }) });
  await expect(usage.getByRole('heading', { name: 'The daily count' })).toBeVisible();
  await expect(usage.getByRole('heading', { name: 'Weekly usage counts' })).toBeVisible();
  await expect(usage).toContainText('Vlo sends the counts of the week before by itself');
  await expect(usage.getByRole('switch')).toHaveCount(0);
  await usage.getByText('A weekly report looks like this').click();
  await expect(usage).toContainText('"words_added_band": "1000-4999"');
  await expect(usage.getByRole('link', { name: 'privacy page' })).toHaveAttribute('href', '/privacy');
  expect(await seriousIssues(page)).toEqual([]);
});

test('Vlo sends the report of last week by itself, once, with no text', async ({ page }) => {
  const calls = await fakeSupabase(page);
  await skipOnboarding(page);
  await seedProjects(page, 1);
  // The first check marks the start of the counts, so the seed below cannot race with it.
  await expect.poll(() => startWeek(page), { timeout: 15_000 }).toMatch(/^\d{4}-W\d{2}$/);
  expect(calls).toHaveLength(0);

  await lastWeekWithWriting(page);
  await page.goto('/');
  await expect.poll(() => calls.length, { timeout: 15_000 }).toBe(1);
  expect(calls[0]?.name).toBe('submit_usage');
  expect(calls[0]?.body.p_report).toMatchObject({ templates_used: ['novel'], words_added_band: '1000-4999' });
  expect(JSON.stringify(calls[0]?.body)).not.toContain('Seeded project');
  expect(calls[0]?.body.p_week).toMatch(/^\d{4}-W\d{2}$/);
  expect(calls[0]?.body.p_app_version).toBe('0.1.0');

  await page.goto('/network');
  await expect(page.getByRole('table')).toContainText('Usage count');

  await page.reload();
  await page.waitForTimeout(6_000);
  expect(calls).toHaveLength(1);
});
