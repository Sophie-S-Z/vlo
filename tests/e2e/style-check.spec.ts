import { expect, test, type Page } from '@playwright/test';
import { seriousIssues } from './support/axe';
import { skipOnboarding } from './support/onboarding';

/* Plan Task H4 (roadmap F47): the style check. Gate 1 in performance.spec.ts types with it on. */

const scene = (page: Page) => page.getByRole('textbox', { name: 'Scene 1' });
const reason = (page: Page) => page.locator('[data-vlo-cursor-note]');

async function switchStyleCheck(page: Page) {
  await page.getByRole('button', { name: 'More tools' }).click();
  await page.getByRole('menuitemcheckbox', { name: 'Style check' }).click();
}

test('the style check is off at first, marks the words, shows why, and goes when it turns off', async ({
  page,
}) => {
  await skipOnboarding(page);
  await page.getByRole('button', { name: 'New project' }).click();
  await page
    .getByRole('dialog', { name: 'New project' })
    .getByRole('button', { name: 'Create project' })
    .click();
  await expect(scene(page)).toBeFocused();
  await page.keyboard.type('It was very cold.');
  await page.getByRole('button', { name: 'More tools' }).click();
  await expect(page.getByRole('menuitemcheckbox', { name: 'Style check' })).not.toBeChecked();
  await page.keyboard.press('Escape');

  await switchStyleCheck(page);
  const mark = scene(page).locator('.vlo-style');
  await expect(mark).toHaveText(['very']);

  await mark.click();
  await expect(reason(page)).toHaveText('"very" adds little. Remove it, or use a stronger word.');
  await page.keyboard.press('End');
  await expect(reason(page)).toHaveText('');
  // The keyboard reaches the reason too: the caret stops at the end of "very".
  for (let i = 0; i < 6; i += 1) await page.keyboard.press('ArrowLeft');
  await expect(reason(page)).toContainText('"very"');
  expect(await seriousIssues(page)).toEqual([]);

  await switchStyleCheck(page);
  await expect(mark).toHaveCount(0);
  await expect(scene(page)).toHaveText('It was very cold.');
});
