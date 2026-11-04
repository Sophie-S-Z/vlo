import { expect, type Page } from '@playwright/test';

/**
 * Each test starts in a fresh profile, so `/` sends it to the welcome screen. This skips it once.
 *
 * In CI Firefox about one page load in twenty never fired its load event, and the test timed out in
 * page.goto. The helper waits for the page's HTML, then for the load event for up to 10 s. When the load
 * event does not come, it logs what the page still loads, for the CI log, and goes on.
 */
export async function skipOnboarding(page: Page) {
  await page.goto('/welcome', { waitUntil: 'domcontentloaded' });
  try {
    await page.waitForLoadState('load', { timeout: 10_000 });
  } catch {
    const pending = await page.evaluate(() => ({
      readyState: document.readyState,
      unfinished: performance
        .getEntriesByType('resource')
        .filter((e) => (e as PerformanceResourceTiming).responseEnd === 0)
        .map((e) => e.name),
      resources: performance.getEntriesByType('resource').length,
      fonts: document.fonts.status,
      scripts: [...document.scripts].map((s) => s.src || 'inline'),
    }));
    console.log(`[load-wait] no load event after 10 s: ${JSON.stringify(pending)}`);
  }
  await page.getByRole('button', { name: 'Skip' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Library' })).toBeVisible();
}
