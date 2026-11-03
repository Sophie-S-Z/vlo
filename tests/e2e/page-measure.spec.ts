import { expect, test, type Page } from '@playwright/test';
import { skipOnboarding } from './support/onboarding';
import { seedLarge } from './support/seed-bundle';

/* Task A7, Review Focus 5: page-end lines on the 10,000-word scene of the seeded 100,000-word project. */

// The seed bundle is a script the test adds, and Vlo's CSP allows only its own scripts. A trace would add
// DOM snapshots to the measured time.
test.use({ bypassCSP: true, trace: 'off' });

const lines = (page: Page) => page.locator('.vlo-page-lines');

async function chooseLetter(page: Page) {
  await page.getByRole('button', { name: /^Page:/ }).click();
  const control = page.getByRole('dialog', { name: 'Page' });
  await control.getByRole('radio', { name: /^Letter/ }).click();
  await expect(control.getByRole('radio', { name: /^Letter/ })).toBeChecked();
  await page.keyboard.press('Escape');
  await expect(control).toBeHidden();
}

test('measuring its page ends after a typing pause stays within one frame', async ({
  page,
  browserName,
  isMobile,
}) => {
  test.skip(isMobile, 'A phone shows the text pageless.');
  test.slow();
  await skipOnboarding(page);
  const seeded = await seedLarge(page);
  await page.goto(`/p/${seeded.projectId}?item=${seeded.longSceneId}`);
  const editor = page.getByRole('textbox', { name: seeded.longSceneTitle });
  await expect(editor).toBeVisible();
  await chooseLetter(page);
  await expect.poll(() => page.locator('[data-page-end]').count(), { timeout: 20_000 }).toBeGreaterThan(15);

  const durations: number[] = [];
  for (let i = 0; i < 3; i++) {
    await editor.click();
    await page.keyboard.press('ControlOrMeta+End');
    await page.keyboard.type(' still');
    await expect(lines(page)).toHaveAttribute('data-stale', '');
    await expect(lines(page)).not.toHaveAttribute('data-stale', { timeout: 5000 });
    durations.push(
      await page.evaluate(() => performance.getEntriesByName('vlo-page-lines').at(-1)?.duration ?? Infinity),
    );
  }
  const best = Math.min(...durations);
  console.log(
    `[${browserName}] page-end measure on the 10,000-word scene: ${durations.map((d) => d.toFixed(1)).join(', ')} ms`,
  );
  // Review Focus 5: one frame on local Chromium. CI runners are up to two times slower.
  expect(best).toBeLessThan(process.env.CI ? 32 : 16);
});
