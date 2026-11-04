import { expect, type Page } from '@playwright/test';

/** Each test starts in a fresh profile, so `/` sends it to the welcome screen. This skips it once. */
export async function skipOnboarding(page: Page) {
  await page.goto('/welcome');
  await page.getByRole('button', { name: 'Skip' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Library' })).toBeVisible();
}
