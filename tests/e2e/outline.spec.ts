import { expect, test, type Page } from '@playwright/test';
import { seriousIssues } from './support/axe';
import { skipOnboarding } from './support/onboarding';

/* Plan Task H1 (roadmap F40): the Outline view for every template, with labels and index cards. */

const binder = (page: Page) => page.getByRole('navigation', { name: 'Binder' });
const views = (page: Page) => page.getByRole('navigation', { name: 'Project views' });

/** A new novel with Chapter 1, Scene 1 and Scene 2, on its Outline screen. */
async function novelOutline(page: Page, isMobile: boolean) {
  await skipOnboarding(page);
  await page.getByRole('button', { name: 'New project' }).click();
  await page
    .getByRole('dialog', { name: 'New project' })
    .getByRole('button', { name: 'Create project' })
    .click();
  await expect(page.getByRole('heading', { level: 2, name: 'Scene 1' })).toBeVisible();
  if (isMobile) await page.getByRole('button', { name: 'Binder' }).click();
  await binder(page).getByRole('button', { name: 'Options for Chapter 1' }).click();
  await page.getByRole('menuitem', { name: 'Add Scene inside' }).click();
  await expect(page.getByRole('heading', { level: 2, name: 'Scene 2' })).toBeVisible();
  if (isMobile) await page.keyboard.press('Escape');
  await views(page).getByRole('link', { name: 'Outline' }).click();
  await expect(page.getByRole('heading', { level: 2, name: 'Outline' })).toBeVisible();
}

test('the table edits the synopsis, status and label, and the binder shows them', async ({
  page,
  isMobile,
}) => {
  await novelOutline(page, isMobile);
  const rows = page.getByRole('table').getByRole('rowheader');
  await expect(rows).toHaveText(['Chapter 1', 'Scene 1', 'Scene 2']);

  await page.getByRole('textbox', { name: 'Synopsis of Scene 1' }).fill('Mira finds the ledger.');
  await page.getByRole('combobox', { name: 'Status of Scene 1' }).selectOption('Revised');

  await page.getByRole('button', { name: 'Labels…' }).click();
  const dialog = page.getByRole('dialog', { name: 'Labels' });
  await dialog.getByRole('button', { name: 'Add a label' }).click();
  await dialog.getByRole('textbox', { name: 'Name of label 1' }).fill('Flashback');
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(dialog).toBeHidden();
  await page.getByRole('combobox', { name: 'Label of Scene 2' }).selectOption('Flashback');
  expect(await seriousIssues(page)).toEqual([]);

  await page.reload();
  await expect(page.getByRole('textbox', { name: 'Synopsis of Scene 1' })).toHaveValue(
    'Mira finds the ledger.',
  );
  await expect(page.getByRole('combobox', { name: 'Status of Scene 1' })).toHaveValue('revised');
  await views(page).getByRole('link', { name: 'Write' }).click();
  if (isMobile) await page.getByRole('button', { name: 'Binder' }).click();
  await expect(binder(page).getByText('Mira finds the ledger.')).toBeVisible();
  await expect(binder(page).getByText('Flashback')).toBeVisible();
});

test('a card moves inside its folder, and the binder keeps the order after a reload', async ({
  page,
  isMobile,
}) => {
  await novelOutline(page, isMobile);
  await page.getByRole('button', { name: 'Cards' }).click();
  await expect(page.getByRole('list', { name: 'Cards in the top of the binder' })).toContainText('Chapter 1');
  await page.getByRole('combobox', { name: 'Cards in' }).selectOption('Chapter 1');
  const cards = page.getByRole('list', { name: 'Cards in Chapter 1' }).getByRole('listitem');
  await expect(cards).toHaveCount(2);
  await page.getByRole('button', { name: 'Options for Scene 1' }).click();
  await page.getByRole('menuitem', { name: 'Move later' }).click();
  await expect(page.getByText('Scene 1 moved. It is now 2 of 2.')).toBeVisible();
  await expect(cards.first()).toContainText('Scene 2');
  expect(await seriousIssues(page)).toEqual([]);

  await page.reload();
  await views(page).getByRole('link', { name: 'Write' }).click();
  if (isMobile) await page.getByRole('button', { name: 'Binder' }).click();
  await expect(binder(page).locator('[data-binder-title]')).toHaveText(['Chapter 1', 'Scene 2', 'Scene 1']);
});

test('at the Simple tool level the command menu opens the Outline', async ({ page }) => {
  await page.goto('/welcome');
  await page.getByRole('button', { name: 'Skip' }).click();
  await page.getByRole('button', { name: 'New project' }).click();
  await page
    .getByRole('dialog', { name: 'New project' })
    .getByRole('button', { name: 'Create project' })
    .click();
  await expect(page.getByRole('heading', { level: 2, name: 'Scene 1' })).toBeVisible();
  await expect(views(page).getByRole('link', { name: 'Outline' })).toHaveCount(0);
  await page.keyboard.press('ControlOrMeta+k');
  const menu = page.getByRole('dialog', { name: 'Command menu' });
  await menu.getByRole('combobox').fill('Outline');
  await menu.getByRole('option', { name: 'Open the Outline' }).click();
  await expect(page.getByRole('heading', { level: 2, name: 'Outline' })).toBeVisible();
  await expect(views(page).getByRole('link', { name: 'Outline' })).toHaveAttribute('aria-current', 'page');
});
