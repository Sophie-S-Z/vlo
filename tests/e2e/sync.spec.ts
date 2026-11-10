import { expect, test, type Page } from '@playwright/test';
import { seriousIssues } from './support/axe';
import { skipOnboarding } from './support/onboarding';
import { fakeSupabase } from './support/share';

/*
 * Plan Task I7 (roadmap F49, decisions R5 to R7): two devices pair, write the same scene offline, and
 * both keep every word. The relay is the fake of tests/fixtures/syncRelay.ts.
 */

// Playwright routes the fake Supabase requests only with no service worker, as in the reader tests.
test.use({ serviceWorkers: 'block' });

const TEXT = 'The harbour lights came on.';
const scene = (page: Page) => page.getByRole('textbox', { name: 'Scene 1' });
const devices = (page: Page) => page.getByRole('list', { name: 'Devices' });

async function syncNow(page: Page) {
  await page.goto('/settings');
  await page.getByRole('button', { name: 'Sync now' }).click();
  await expect(page.getByRole('status').filter({ hasText: /^Synced\.$/ })).toBeVisible();
}

async function type(page: Page, key: 'Home' | 'End', words: string) {
  await scene(page).click();
  await page.keyboard.press(`ControlOrMeta+${key}`);
  await page.keyboard.type(words);
  await expect(page.getByRole('status').filter({ hasText: /Saved/ })).toHaveText('Saved');
}

/** The labels and texts of the snapshots on this device. */
const snapshots = (page: Page) =>
  page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const open = indexedDB.open('vlo');
      open.onsuccess = () => {
        resolve(open.result);
      };
      open.onerror = () => {
        reject(open.error ?? new Error('open failed'));
      };
    });
    const rows = await new Promise<{ label?: string; text: string }[]>((resolve) => {
      const request = db.transaction('snapshots').objectStore('snapshots').getAll();
      request.onsuccess = () => {
        resolve(request.result as { label?: string; text: string }[]);
      };
    });
    db.close();
    return rows.map((r) => [r.label ?? '', r.text]);
  });

test('two devices pair, write the same scene offline, and both keep every word', async ({ browser }) => {
  const laptopContext = await browser.newContext();
  const fake = await fakeSupabase(laptopContext);
  const laptop = await laptopContext.newPage();
  await skipOnboarding(laptop);
  await laptop.getByRole('button', { name: 'New project' }).click();
  await laptop
    .getByRole('dialog', { name: 'New project' })
    .getByRole('button', { name: 'Create project' })
    .click();
  await expect(scene(laptop)).toBeFocused();
  await laptop.keyboard.type(TEXT);
  await expect(laptop.getByRole('status').filter({ hasText: /Saved/ })).toHaveText('Saved');
  const sceneUrl = laptop.url();

  await laptop.goto('/settings');
  await laptop.getByLabel('Name of this device').fill('Laptop');
  await laptop.getByRole('button', { name: 'Sync my writing' }).click();
  const pair = laptop.getByRole('dialog', { name: 'Add a device' });
  await expect(pair.getByRole('img', { name: 'QR code of the pairing link' })).toBeVisible();
  const link = await pair.getByRole('textbox', { name: 'Pairing link' }).inputValue();
  expect(await seriousIssues(laptop)).toEqual([]);
  await pair.getByRole('button', { name: 'Done' }).click();
  await syncNow(laptop);

  const phoneContext = await browser.newContext();
  await fakeSupabase(phoneContext, fake);
  const phone = await phoneContext.newPage();
  await skipOnboarding(phone);
  await phone.goto(new URL(link).pathname + new URL(link).hash);
  // The address bar loses the fragment at once.
  await expect.poll(() => new URL(phone.url()).hash).toBe('');
  await phone.getByLabel('Name of this device').fill('Phone');
  await phone.getByRole('button', { name: 'Start sync' }).click();
  await expect(phone.getByText('This device syncs with your other devices now.')).toBeVisible();
  await syncNow(phone);
  await expect(devices(phone)).toContainText('Phone (this device)');
  await expect(devices(phone)).toContainText('Laptop');
  await phone.goto(sceneUrl);
  await expect(scene(phone)).toHaveText(TEXT);

  // Both write offline, then sync: the laptop first, then the phone, which joins the two texts.
  // The pages load first, because the tests run with no service worker.
  await laptop.goto(sceneUrl);
  await expect(scene(laptop)).toHaveText(TEXT);
  await laptopContext.setOffline(true);
  await phoneContext.setOffline(true);
  await type(laptop, 'End', ' The gulls slept.');
  await type(phone, 'Home', 'Night fell. ');
  await laptopContext.setOffline(false);
  await phoneContext.setOffline(false);
  await syncNow(laptop);
  await syncNow(phone);
  await syncNow(laptop);
  const both = 'Night fell. The harbour lights came on. The gulls slept.';
  for (const page of [laptop, phone]) {
    await page.goto(sceneUrl);
    await expect(scene(page)).toHaveText(both);
  }
  expect(await snapshots(phone)).toContainEqual(['Before sync', 'Night fell. The harbour lights came on.']);
  // The safety badge counts the other devices and shows the last sync.
  await phone.getByRole('button', { name: /^Safety: / }).click();
  await expect(phone.getByRole('dialog', { name: 'Safety of your work' })).toContainText(
    'Syncs with 1 other device. Synced just now.',
  );
  await phone.keyboard.press('Escape');

  // Each request went to the relay as sync, and each body was sealed.
  const log = await laptop.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve) => {
      const open = indexedDB.open('vlo');
      open.onsuccess = () => {
        resolve(open.result);
      };
    });
    return new Promise<string[]>((resolve) => {
      const request = db.transaction('networkLog').objectStore('networkLog').getAll();
      request.onsuccess = () => {
        resolve((request.result as { purpose: string }[]).map((e) => e.purpose));
        db.close();
      };
    });
  });
  expect(new Set(log)).toEqual(new Set(['sync']));
  const sent = JSON.stringify(fake.calls.filter((c) => c.name === 'sync_put'));
  for (const words of ['harbour', 'gulls', 'Night', 'Laptop', 'Scene 1']) expect(sent).not.toContain(words);

  // Stop sync on all devices: the phone stops at its next round, which runs when Vlo opens, and keeps its projects.
  await laptop.goto('/settings');
  await laptop.getByRole('button', { name: 'Stop sync on all devices' }).click();
  await laptop.getByRole('alertdialog').getByRole('button', { name: 'Stop sync' }).click();
  await expect(laptop.getByRole('button', { name: 'Sync my writing' })).toBeVisible();
  await phone.goto('/settings');
  await expect(phone.getByRole('button', { name: 'Sync my writing' })).toBeVisible();
  await phone.goto(sceneUrl);
  await expect(scene(phone)).toHaveText(both);
  await laptopContext.close();
  await phoneContext.close();
});

for (const theme of ['ink', 'paper', 'sepia', 'contrast'] as const) {
  test(`Devices and the pairing dialog have no serious axe issues in ${theme}`, async ({ context, page }) => {
    await fakeSupabase(context);
    await page.addInitScript((t) => {
      localStorage.setItem('vlo:preferences', JSON.stringify({ theme: t, calm: false }));
    }, theme);
    await skipOnboarding(page);
    await page.goto('/settings');
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    expect(await seriousIssues(page)).toEqual([]);
    await page.getByRole('button', { name: 'Sync my writing' }).click();
    await expect(page.getByRole('dialog', { name: 'Add a device' })).toBeVisible();
    expect(await seriousIssues(page)).toEqual([]);
    await page.keyboard.press('Escape');
    await expect(devices(page)).toContainText('(this device)');
    expect(await seriousIssues(page)).toEqual([]);
  });
}
