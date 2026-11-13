import { expect, test, type Page } from '@playwright/test';
import { seriousIssues } from './support/axe';
import { skipOnboarding } from './support/onboarding';

const binder = (page: Page) => page.getByRole('navigation', { name: 'Binder' });
const tabs = (page: Page) => page.getByRole('navigation', { name: 'Project views' }).getByRole('link');

async function newProject(page: Page, names: RegExp[]) {
  await page.getByRole('button', { name: 'New project' }).click();
  const dialog = page.getByRole('dialog', { name: 'New project' });
  for (const name of names) await dialog.getByRole('checkbox', { name }).click();
  return dialog;
}

test('open writing starts on Page 1, and its binder adds folders, pages and notes', async ({ page }) => {
  test.skip(test.info().project.name === 'mobile-chrome', 'Under 600 px the binder is a drawer.');
  await skipOnboarding(page);
  const dialog = await newProject(page, [/Open writing/]);
  await expect(dialog.getByLabel('Title')).toHaveValue('Untitled writing');
  expect(await seriousIssues(page)).toEqual([]);
  await dialog.getByRole('button', { name: 'Create project' }).click();

  await expect(page.getByRole('heading', { level: 1, name: 'Untitled writing' })).toBeVisible();
  await expect(page.getByRole('heading', { level: 2, name: 'Page 1' })).toBeVisible();
  await page.getByRole('textbox', { name: 'Page 1' }).pressSequentially('Dear Ada,');
  // Open writing has no views of its own: only Write, and the views of every project in the More menu.
  await expect(tabs(page)).toHaveText(['Write']);
  await page.getByRole('button', { name: 'More views' }).click();
  await expect(page.getByRole('menuitem')).toHaveText([
    /^Outline/,
    /^Codex/,
    /^Feedback/,
    /^Book/,
    /^Submissions/,
    /^Progress/,
  ]);
  await page.keyboard.press('Escape');

  await binder(page).getByRole('button', { name: 'Add to binder' }).click();
  await expect(page.getByRole('menuitem')).toHaveText(['Folder', 'Page', 'Note']);
  await page.getByRole('menuitem', { name: 'Folder' }).click();
  await binder(page)
    .getByRole('button', { name: /^Options for Folder/ })
    .click();
  await expect(page.getByRole('menuitem', { name: 'Add Folder inside' })).toBeVisible();
  await page.getByRole('menuitem', { name: 'Add Page inside' }).click();
  await expect(page.getByRole('heading', { level: 2, name: 'Page 2' })).toBeVisible();
});

test('a mix of novel and memoir gets the starters, the binder kinds and the views of both', async ({
  page,
}) => {
  await skipOnboarding(page);
  // The first pick replaces the Novel suggestion, so Novel goes back on with a second click.
  const dialog = await newProject(page, [/Memoir/, /Novel/]);
  await expect(dialog.getByRole('checkbox', { name: /Novel/ })).toBeChecked();
  await expect(dialog.getByRole('checkbox', { name: /Memoir/ })).toBeChecked();
  await expect(dialog.getByLabel('Title')).toHaveValue('Untitled project');
  await dialog.getByRole('button', { name: 'Create project' }).click();

  await expect(page.getByRole('heading', { level: 2, name: 'Scene 1' })).toBeVisible();
  // The views of both templates are tabs. The views of every project sit in the More menu.
  await expect(tabs(page)).toHaveText(['Write', 'Board', 'Plot Grid', 'Timeline', 'People']);
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Library' }).click();
  await expect(page.getByRole('list', { name: 'Projects' }).getByText('Novel + Memoir')).toBeVisible();
});
