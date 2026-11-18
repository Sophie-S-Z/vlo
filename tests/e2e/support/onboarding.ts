import { expect, type Page } from '@playwright/test';

/**
 * A signed-out visit opens on the sign-in screen in a build with accounts. Tests that do not test it choose
 * "Write without an account" ahead, as the screen keeps that choice for the tab.
 */
export async function writeWithoutAccount(page: Page) {
  // The choice holds for one tab, so the context gives it to each new tab of the test too.
  await page.context().addInitScript(() => {
    sessionStorage.setItem('vlo:guest', '1');
  });
}

/**
 * Each test starts in a fresh profile, so `/` sends it to the welcome screen. This skips it once.
 * `dailyCount` lets the daily count go, which is always on for a real writer.
 */
export async function skipOnboarding(page: Page, { dailyCount = false } = {}) {
  await writeWithoutAccount(page);
  // The welcome starts a new writer at the Simple tool level. These tests use every tool, so they start
  // at Full; tool-level.spec.ts tests the Simple start.
  await page.addInitScript(() => {
    if (localStorage.getItem('vlo:writing') === null)
      localStorage.setItem('vlo:writing', JSON.stringify({ toolLevel: 'full' }));
    // The getting-started guide stays closed here; guide.spec.ts tests it.
    if (localStorage.getItem('vlo:guide') === null)
      localStorage.setItem('vlo:guide', JSON.stringify({ closed: true, index: 0 }));
  });
  // The daily count (Phase 18) is always on for a real writer. Here it stays quiet, so the network tests
  // see only what they test; accounts.spec.ts tests the count.
  if (!dailyCount)
    await page.addInitScript(() => {
      (globalThis as { vloNoDailyCount?: boolean }).vloNoDailyCount = true;
    });
  await page.goto('/welcome');
  await page.getByRole('button', { name: 'Skip' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Library' })).toBeVisible();
}
