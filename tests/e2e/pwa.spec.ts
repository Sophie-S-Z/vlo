import { readFileSync, writeFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { skipOnboarding, writeWithoutAccount } from './support/onboarding';

// A signed-out visit opens on the sign-in screen; these tests write with no account.
test.beforeEach(async ({ page }) => {
  await writeWithoutAccount(page);
});

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
  await skipOnboarding(page);
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

test('Vlo opens offline, including deep links and unknown paths', async ({ page, context, browserName }) => {
  await waitForControl(page);
  // Workbox stores index.html with a revision query, so the lookup ignores the query string.
  const missing = await page.evaluate(async () => {
    const needed = [
      '/index.html',
      ...[...document.querySelectorAll<HTMLScriptElement>('script[src]')].map((s) => new URL(s.src).pathname),
      ...[...document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]')].map(
        (l) => new URL(l.href).pathname,
      ),
    ];
    const results = await Promise.all(
      needed.map(async (path) => ((await caches.match(path, { ignoreSearch: true })) ? null : path)),
    );
    return results.filter((path) => path !== null);
  });
  expect(missing).toEqual([]);
  if (browserName === 'webkit') {
    // Playwright's WebKit cannot load a page that a service worker answers while the network is off:
    // setOffline gives "WebKit encountered an internal error" and routing gives "Blocked by Web Inspector".
    // So in WebKit this test stops after the precache check above.
    // Real Safari offline use is a manual step in docs/safari-storage-test.md (Phase 6).
    test.info().annotations.push({ type: 'webkit', description: 'Precache check only; see comment.' });
    return;
  }
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('heading', { level: 1, name: 'Library' })).toBeVisible();
  await page.goto('/settings');
  await expect(page.getByRole('heading', { level: 1, name: 'Settings' })).toBeVisible();
  await page.goto('/nope');
  await expect(page.getByRole('heading', { level: 1, name: 'Page not found' })).toBeVisible();
});

/** True while a new version waits for its turn, or while the page reloads to take it. */
const waiting = (page: Page) =>
  page
    .evaluate(async () => (await navigator.serviceWorker.getRegistration())?.waiting != null)
    .catch(() => true);

/** A changed service worker file is a new version of Vlo. */
async function release(page: Page) {
  writeFileSync(
    'dist/sw.js',
    `${readFileSync('dist/sw.js', 'utf8')}\n// next version ${String(Date.now())}\n`,
  );
  await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.getRegistration();
    await registration?.update();
  });
}

// Both tests below edit dist/sw.js on disk, so they must never run at the same time.
test.describe('service worker updates', () => {
  test.describe.configure({ mode: 'serial' });

  test('a new version waits while the writer works, then loads by itself on the next visit', async ({
    page,
  }, testInfo) => {
    // This test edits the built service worker on disk, so only one project may run it.
    test.skip(testInfo.project.name !== 'chromium', 'Runs once, in the chromium project.');
    await waitForControl(page);
    // The writer starts to work, so the tab must not reload under them.
    await page.getByRole('heading', { level: 1 }).click();
    await page.evaluate(() => {
      (window as unknown as { __marker: boolean }).__marker = true;
    });
    const original = readFileSync('dist/sw.js', 'utf8');
    try {
      await release(page);
      await expect.poll(() => waiting(page), { timeout: 15_000 }).toBe(true);
      await page.waitForTimeout(1_000);
      expect(await page.evaluate(() => (window as unknown as { __marker?: boolean }).__marker)).toBe(true);
      await expect(page.getByText('A new version of Vlo is ready.')).toHaveCount(0);

      // The next visit finds the waiting version and loads it with no notice.
      await page.reload();
      await expect.poll(() => waiting(page), { timeout: 15_000 }).toBe(false);
      await expect(page.getByRole('heading', { level: 1, name: 'Library' })).toBeVisible();
    } finally {
      writeFileSync('dist/sw.js', original);
    }
  });

  test('an update never reloads another tab where the writer works', async ({ context }, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium', 'Runs once, in the chromium project.');
    const writing = await context.newPage();
    await waitForControl(writing);
    // The other tab only loads Vlo. No click or key reaches it.
    const other = await context.newPage();
    await other.goto('/');
    await expect.poll(() => other.evaluate(() => navigator.serviceWorker.controller !== null)).toBe(true);
    await writing.getByRole('heading', { level: 1 }).click();
    await writing.evaluate(() => {
      (window as unknown as { __marker: boolean }).__marker = true;
    });
    const original = readFileSync('dist/sw.js', 'utf8');
    try {
      // The other tab is untouched, so it takes the new version and reloads by itself.
      const otherReloaded = other.waitForEvent('load', { timeout: 15_000 });
      await release(other);
      await otherReloaded;
      await expect.poll(() => waiting(other), { timeout: 15_000 }).toBe(false);
      await writing.waitForTimeout(1_000);
      expect(await writing.evaluate(() => (window as unknown as { __marker?: boolean }).__marker)).toBe(true);
    } finally {
      writeFileSync('dist/sw.js', original);
    }
  });
});
