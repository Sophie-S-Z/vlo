import { expect, test } from '@playwright/test';
import { seriousIssues } from './support/axe';
import { skipOnboarding } from './support/onboarding';

/* Plan Task D7: /ai-policy states the four rules with a version and a date, and the footer links to it. */

test('the footer opens the AI policy, which states the four rules', async ({ page }) => {
  await skipOnboarding(page);
  await page.getByRole('contentinfo').getByRole('link', { name: 'AI policy' }).click();
  await expect(page).toHaveURL(/\/ai-policy$/);
  await expect(page).toHaveTitle(/AI policy/);
  await expect(page.getByRole('heading', { level: 1, name: 'AI policy' })).toBeVisible();
  await expect(page.getByText('Version 1, November 5, 2026')).toBeVisible();
  await expect(page.getByRole('heading', { level: 2 })).toHaveText([
    'Vlo trains no model on your text.',
    'No Vlo server receives your manuscript text.',
    'Pen mode loads no AI code and sends nothing.',
    'With your own provider key, the provider’s terms apply, and Vlo shows them first.',
  ]);
  expect(await seriousIssues(page)).toEqual([]);
});

for (const theme of ['ink', 'paper', 'sepia'] as const) {
  test(`the AI policy has no serious axe issues in ${theme}`, async ({ page }) => {
    await page.addInitScript((t) => {
      localStorage.setItem('vlo:preferences', JSON.stringify({ theme: t, calm: true }));
    }, theme);
    await skipOnboarding(page);
    await page.goto('/ai-policy');
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    await expect(page.getByRole('heading', { level: 1, name: 'AI policy' })).toBeVisible();
    expect(await seriousIssues(page)).toEqual([]);
  });
}
