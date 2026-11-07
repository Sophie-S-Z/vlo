import { expect, test, type Page, type Route } from '@playwright/test';
import { seriousIssues } from './support/axe';
import { skipOnboarding } from './support/onboarding';
import { seedProjects } from './support/seed';

/* Plan Task E5 (spec F30, decision S6): opt-in usage counts, with the exact JSON before each send. */

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

/** A writing session 7 days ago, and a usage state that has not handled last week yet. */
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
        const meta = tx.objectStore('appMeta');
        const read = meta.get('usage');
        read.onsuccess = () => {
          const value = (read.result as { value: Record<string, unknown> } | undefined)?.value ?? {};
          meta.put({ key: 'usage', value: { ...value, handledWeek: '2000-W01' } });
        };
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

test('usage counts start off, ask first, and send the exact JSON that the Library shows', async ({
  page,
}) => {
  const calls = await fakeSupabase(page);
  await skipOnboarding(page);
  await page.goto('/settings');
  const toggle = page.getByRole('switch', { name: 'Send weekly usage counts' });
  await expect(toggle).not.toBeChecked();

  await toggle.click();
  const dialog = page.getByRole('dialog', { name: 'Send weekly usage counts?' });
  await expect(dialog).toContainText('"words_added_band": "1000-4999"');
  expect(await seriousIssues(page)).toEqual([]);
  await dialog.getByRole('button', { name: 'Turn on' }).click();
  await expect(toggle).toBeChecked();
  await expect(page.getByText('Usage counts are on.')).toBeVisible();

  await seedProjects(page, 1);
  await lastWeekWithWriting(page);
  await page.goto('/');
  const prompt = page.getByRole('region', { name: 'Usage counts for last week' });
  await expect(prompt).toBeVisible();
  const shown = JSON.parse((await prompt.getByLabel('The report').textContent()) ?? '') as Record<
    string,
    unknown
  >;
  expect(shown).toMatchObject({ templates_used: ['novel'], words_added_band: '1000-4999' });
  expect(JSON.stringify(shown)).not.toContain('Seeded project');
  await expect(prompt).toContainText(/with the week \(\d{4}-W\d{2}\) and the app version \(0\.1\.0\)/);
  expect(await seriousIssues(page)).toEqual([]);
  expect(calls).toHaveLength(0);

  await prompt.getByRole('button', { name: 'Send' }).click();
  await expect(page.getByText('Sent.')).toBeVisible();
  await expect(prompt).toHaveCount(0);
  expect(calls.map((c) => c.name)).toEqual(['submit_usage']);
  expect(calls[0]?.body.p_report).toEqual(shown);
  expect(calls[0]?.body.p_week).toMatch(/^\d{4}-W\d{2}$/);
  expect(calls[0]?.body.p_app_version).toBe('0.1.0');

  await page.reload();
  await expect(page.getByRole('heading', { level: 1, name: 'Library' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Usage counts for last week' })).toHaveCount(0);
});

test('with usage counts off, the Library asks nothing and sends nothing', async ({ page }) => {
  const calls = await fakeSupabase(page);
  await skipOnboarding(page);
  await seedProjects(page, 1);
  await lastWeekWithWriting(page);
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1, name: 'Library' })).toBeVisible();
  await expect(page.getByText('Seeded project 1')).toBeVisible();
  await expect(page.getByRole('region', { name: 'Usage counts for last week' })).toHaveCount(0);
  expect(calls).toHaveLength(0);
});
