import { expect, test } from '@playwright/test';
import { seriousIssues } from './support/axe';

/* Plan Task G6 (roadmap F36, decision P4): a new writer starts with the Simple toolbar. */

test('a new writer starts at Simple, and the More menu and Settings switch the level', async ({
  page,
  isMobile,
}) => {
  // No skipOnboarding here: it starts the other tests at Full.
  await page.goto('/welcome');
  await page.getByRole('button', { name: 'Skip' }).click();
  await page.getByRole('button', { name: 'New project' }).click();
  await page
    .getByRole('dialog', { name: 'New project' })
    .getByRole('button', { name: 'Create project' })
    .click();
  await expect(page.getByRole('textbox', { name: 'Scene 1' })).toBeFocused();

  const toolbar = page.getByRole('toolbar', { name: 'Formatting', exact: true });
  await expect(toolbar.getByRole('button', { name: 'Bold' })).toBeVisible();
  await expect(toolbar.getByRole('button', { name: 'Underline' })).toBeHidden();
  expect(await toolbar.getByRole('button').filter({ visible: true }).count()).toBeLessThanOrEqual(8);
  expect(await seriousIssues(page)).toEqual([]);

  // A hidden tool is in the More menu: open the menu, pick the tool.
  await page.keyboard.type('Salt');
  await page.keyboard.press('ControlOrMeta+a');
  await toolbar.getByRole('button', { name: 'More tools' }).click();
  await page.getByRole('menuitemcheckbox', { name: /^Underline/ }).click();
  await expect(page.getByRole('textbox', { name: 'Scene 1' }).locator('u')).toHaveText('Salt');

  await toolbar.getByRole('button', { name: 'More tools' }).click();
  await page.getByRole('menuitem', { name: 'Show all tools' }).click();
  // A phone shows its narrow toolbar at both levels, so only a wider screen shows the extra tools.
  if (!isMobile) await expect(toolbar.getByRole('button', { name: 'Underline' })).toBeVisible();

  await page.goto('/settings');
  const all = page.getByRole('switch', { name: 'Show all tools in the toolbar' });
  await expect(all).toBeChecked();
  await all.click();
  await expect(all).not.toBeChecked();
  await page.goBack();
  await expect(toolbar.getByRole('button', { name: 'Underline' })).toBeHidden();
});
