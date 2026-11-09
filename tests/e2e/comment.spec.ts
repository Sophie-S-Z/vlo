import { expect, test, type Page } from '@playwright/test';
import { seriousIssues } from './support/axe';
import { skipOnboarding } from './support/onboarding';
import { useTool } from './support/tools';

/* Plan Task H3 (roadmap F43): comments on the words of the text. */

const scene = (page: Page) => page.getByRole('textbox', { name: 'Scene 1' });
const comments = (page: Page) => page.getByRole('region', { name: 'Comments' });
const panel = (page: Page) => page.getByRole('dialog', { name: 'Comment' });

test('a comment goes on the selected words, survives a reload, opens from the list and resolves', async ({
  page,
}) => {
  await skipOnboarding(page);
  await page.getByRole('button', { name: 'New project' }).click();
  await page
    .getByRole('dialog', { name: 'New project' })
    .getByRole('button', { name: 'Create project' })
    .click();
  await expect(scene(page)).toBeFocused();
  await page.keyboard.type('Mira finds the ledger');
  await page.keyboard.press('Shift+Home');

  await useTool(page, 'Comment');
  await panel(page).getByRole('textbox', { name: 'Comment' }).fill('Too quick?');
  await panel(page).getByRole('button', { name: 'Save' }).click();
  await expect(panel(page)).toBeHidden();
  await expect(scene(page).locator('.vlo-comment')).toHaveText('Mira finds the ledger');
  await expect(comments(page).getByRole('button').first()).toContainText('Too quick?');
  expect(await seriousIssues(page)).toEqual([]);

  await page.reload();
  await comments(page)
    .getByRole('button', { name: /Too quick\?/ })
    .click();
  const text = panel(page).getByRole('textbox', { name: 'Comment' });
  await expect(text).toHaveValue('Too quick?');
  await text.fill('Slow this down.');
  await panel(page).getByRole('button', { name: 'Save' }).click();
  await expect(comments(page)).toContainText('Slow this down.');

  await comments(page)
    .getByRole('button', { name: /^Resolve the comment/ })
    .click();
  await expect(comments(page)).toHaveCount(0);
  await expect(scene(page).locator('.vlo-comment')).toHaveCount(0);
  await expect(scene(page)).toHaveText('Mira finds the ledger');
});
