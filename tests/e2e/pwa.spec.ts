import { readFileSync, writeFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

interface ManifestIcon {
  src: string;
  sizes: string;
  purpose?: string;
}
interface Manifest {
  name: string;
  short_name: string;
  start_url: string;
  display: string;
  theme_color: string;
  background_color: string;
  icons: ManifestIcon[];
}

async function waitForControl(page: Page) {
  await page.goto('/');
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  if (!(await page.evaluate(() => navigator.serviceWorker.controller !== null))) {
    await page.reload();
  }
  await expect.poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null)).toBe(true);
}

test('the manifest makes Vlo installable', async ({ page, request }) => {
  await page.goto('/');
  const href = await page.locator('link[rel="manifest"]').getAttribute('href');
  expect(href).toBeTruthy();
  const manifest = (await (await request.get(href ?? '')).json()) as Manifest;
  expect(manifest).toMatchObject({ name: 'Vlo', short_name: 'Vlo', start_url: '/', display: 'standalone' });
  expect(manifest.theme_color).toMatch(/^#[0-9a-f]{6}$/i);
  expect(manifest.background_color).toMatch(/^#[0-9a-f]{6}$/i);
  const sizes = manifest.icons.map((i) => i.sizes);
  expect(sizes).toContain('192x192');
  expect(sizes).toContain('512x512');
  expect(manifest.icons.some((i) => i.purpose === 'maskable')).toBe(true);
  for (const icon of manifest.icons) {
    const res = await request.get(`/${icon.src.replace(/^\//, '')}`);
    expect(res.status(), icon.src).toBe(200);
    expect(res.headers()['content-type']).toBe('image/png');
  }
});

test('Chromium reports no installability errors', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'Installability errors come from the Chrome DevTools Protocol.');
  await waitForControl(page);
  const cdp = await page.context().newCDPSession(page);
  const { installabilityErrors } = (await cdp.send('Page.getInstallabilityErrors')) as {
    installabilityErrors: { errorId: string }[];
  };
  expect(installabilityErrors.map((e) => e.errorId)).toEqual([]);
});

test('Vlo opens offline, including deep links and unknown paths', async ({ page, context }) => {
  await waitForControl(page);
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('heading', { level: 1, name: 'Library' })).toBeVisible();
  await page.goto('/settings');
  await expect(page.getByRole('heading', { level: 1, name: 'Settings' })).toBeVisible();
  await page.goto('/nope');
  await expect(page.getByRole('heading', { level: 1, name: 'Page not found' })).toBeVisible();
});

test('a new version waits for the writer and never reloads by itself', async ({ page }, testInfo) => {
  // This test edits the built service worker on disk, so only one project may run it.
  test.skip(testInfo.project.name !== 'chromium', 'Runs once, in the chromium project.');
  await waitForControl(page);
  await page.evaluate(() => {
    (window as unknown as { __marker: boolean }).__marker = true;
  });
  const swPath = 'dist/sw.js';
  const original = readFileSync(swPath, 'utf8');
  try {
    // A changed service worker file is a new version of Vlo.
    writeFileSync(swPath, `${original}\n// next version ${String(Date.now())}\n`);
    await page.evaluate(async () => {
      const registration = await navigator.serviceWorker.getRegistration();
      await registration?.update();
    });
    const updateButton = page.getByRole('button', { name: 'Reload to update' });
    await expect(updateButton).toBeVisible({ timeout: 15_000 });
    await page.waitForTimeout(1_000);
    expect(await page.evaluate(() => (window as unknown as { __marker?: boolean }).__marker)).toBe(true);
    await expect(page.getByRole('heading', { level: 1, name: 'Library' })).toBeVisible();
  } finally {
    writeFileSync(swPath, original);
  }
});
