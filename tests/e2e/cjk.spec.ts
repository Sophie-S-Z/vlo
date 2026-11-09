import { expect, test } from '@playwright/test';
import { skipOnboarding } from './support/onboarding';

/* Plan Task H9 (roadmap F38): a Japanese project counts characters, and a language change counts again. */

test('a Japanese scene counts characters, and the count follows a change of language', async ({ page }) => {
  await skipOnboarding(page);
  await page.getByRole('button', { name: 'New project' }).click();
  await page
    .getByRole('dialog', { name: 'New project' })
    .getByRole('button', { name: 'Create project' })
    .click();
  const scene = page.getByRole('textbox', { name: 'Scene 1' });
  await expect(scene).toBeFocused();
  await page.keyboard.type('東京へ行く。');
  await expect(page.getByRole('status').filter({ hasText: /Saved/ })).toHaveText('Saved');
  // A project with no language counts words.
  const count = page.locator('.vlo-roll');
  await expect(count).toHaveText(/ words?$/);

  await page.getByRole('button', { name: /^Page:/ }).click();
  await page.getByLabel('Language of the writing').selectOption('ja');
  await page.keyboard.press('Escape');
  await expect(count).toHaveText('5 characters');
  await page.reload();
  await expect(count).toHaveText('5 characters');
  await page.goto('/');
  await expect(page.getByText('5 characters')).toBeVisible();
});
