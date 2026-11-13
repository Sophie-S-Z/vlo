import { expect, type Page } from '@playwright/test';

/** Each test starts in a fresh profile, so `/` sends it to the welcome screen. This skips it once. */
export async function skipOnboarding(page: Page) {
  // The welcome starts a new writer at the Simple tool level. These tests use every tool, so they start
  // at Full; tool-level.spec.ts tests the Simple start.
  await page.addInitScript(() => {
    if (localStorage.getItem('vlo:writing') === null)
      localStorage.setItem('vlo:writing', JSON.stringify({ toolLevel: 'full' }));
    // The first-use tips line (Phase 17) stays closed here; tips.spec.ts tests it.
    if (localStorage.getItem('vlo:tips') === null)
      localStorage.setItem('vlo:tips', JSON.stringify({ closed: true, index: 0 }));
  });
  await page.goto('/welcome');
  await page.getByRole('button', { name: 'Skip' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Library' })).toBeVisible();
}
