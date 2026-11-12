import { expect, test } from '@playwright/test';
import { seriousIssues } from './support/axe';

/* Phase 17 decision S5: a new writer sees one tip line that names the ways to the hidden tools. */

test('a new writer sees one tip at a time, Close hides the tips, and Settings shows them again', async ({
  page,
}) => {
  await page.goto('/welcome');
  await page.getByRole('button', { name: 'Skip' }).click();
  await page.getByRole('button', { name: 'New project' }).click();
  await page
    .getByRole('dialog', { name: 'New project' })
    .getByRole('button', { name: 'Create project' })
    .click();
  await expect(page.getByRole('textbox', { name: 'Scene 1' })).toBeFocused();

  const tip = page.getByRole('complementary', { name: 'Tip' });
  await expect(tip).toContainText('to find any tool, view or item by name');
  expect(await seriousIssues(page)).toEqual([]);
  await tip.getByRole('button', { name: 'Next tip' }).click();
  await expect(tip).toContainText('Type / in the text');

  // The command menu that the first tip names finds a tool that sits on the screen as an icon.
  await page.keyboard.press('ControlOrMeta+k');
  const menu = page.getByRole('dialog', { name: 'Command menu' });
  await menu.getByRole('combobox').fill('readability');
  await menu.getByRole('option', { name: 'Open Insights…' }).click();
  await expect(page.getByRole('dialog', { name: 'Insights' })).toBeVisible();
  await page.keyboard.press('Escape');

  await tip.getByRole('button', { name: 'Close the tips' }).click();
  await expect(tip).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole('textbox', { name: 'Scene 1' })).toBeVisible();
  await expect(tip).toHaveCount(0);

  await page.goto('/settings');
  await page.getByRole('button', { name: 'Show the tips again' }).click();
  await page.goBack();
  await expect(tip).toContainText('to find any tool, view or item by name');
});

test('the views that are not tabs sit in the More menu, with a line that says what each is for', async ({
  page,
}) => {
  await page.goto('/welcome');
  await page.getByRole('button', { name: 'Skip' }).click();
  await page.getByRole('button', { name: 'New project' }).click();
  await page
    .getByRole('dialog', { name: 'New project' })
    .getByRole('button', { name: 'Create project' })
    .click();
  const views = page.getByRole('navigation', { name: 'Project views' });
  await expect(views.getByRole('link')).toHaveText(['Write', 'Board', 'Plot Grid']);
  await views.getByRole('button', { name: 'More views' }).click();
  const codex = page.getByRole('menuitem', { name: /^Codex/ });
  await expect(codex).toContainText('Characters, places and things');
  expect(await seriousIssues(page)).toEqual([]);
  await codex.click();
  await expect(page.getByRole('heading', { level: 2, name: 'Codex' })).toBeVisible();
  // The view on show has its own tab, marked as the current page.
  await expect(views.getByRole('link', { name: 'Codex' })).toHaveAttribute('aria-current', 'page');
});
