import { expect, test, type Page } from '@playwright/test';
import { seriousIssues } from './support/axe';
import { skipOnboarding, writeWithoutAccount } from './support/onboarding';
import { openToolMenu, useTool } from './support/tools';

// A signed-out visit opens on the sign-in screen; these tests write with no account.
test.beforeEach(async ({ page }) => {
  await writeWithoutAccount(page);
});

/* Phase 19, Task F2: tables. */

const scene = (page: Page) => page.getByRole('textbox', { name: 'Scene 1' });

test('Insert > Table puts a table, Tab moves between cells, and Format > Table changes it', async ({
  page,
}) => {
  await skipOnboarding(page);
  await page.getByRole('button', { name: 'New project' }).click();
  await page
    .getByRole('dialog', { name: 'New project' })
    .getByRole('button', { name: 'Create project' })
    .click();
  await expect(scene(page)).toBeFocused();
  await page.keyboard.type('The crew.');

  // Format has no table tools outside a table.
  await openToolMenu(page, 'Underline');
  await expect(page.getByRole('menu').getByRole('group', { name: 'Table', exact: true })).toHaveCount(0);
  await page.keyboard.press('Escape');

  // The grid: the arrow keys mark the size, and Enter puts the table.
  await useTool(page, 'Table');
  const grid = page.getByRole('group', { name: 'Table size' });
  await expect(grid).toBeVisible();
  expect(await seriousIssues(page)).toEqual([]);
  await grid.getByRole('button', { name: '1 row, 1 column' }).focus();
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowDown');
  await expect(grid.getByRole('button', { name: '2 rows, 2 columns' })).toBeFocused();
  await page.keyboard.press('Enter');
  const table = scene(page).locator('table');
  await expect(table.locator('tr')).toHaveCount(2);
  await expect(table.locator('th')).toHaveCount(2);

  // Tab moves to the next cell, and the line under the toolbar says where the caret is.
  await expect(page.getByText('Table, row 1 of 2, column 1 of 2.')).toBeVisible();
  await page.keyboard.type('Name');
  await page.keyboard.press('Tab');
  await page.keyboard.type('Port');
  await page.keyboard.press('Tab');
  await expect(page.getByText('Table, row 2 of 2, column 1 of 2.')).toBeVisible();
  await page.keyboard.type('Mira');
  await page.keyboard.press('Tab');
  await page.keyboard.type('Hull');
  // Tab in the last cell adds a row.
  await page.keyboard.press('Tab');
  await expect(table.locator('tr')).toHaveCount(3);
  await page.keyboard.press('Shift+Tab');
  await expect(page.getByText('Table, row 2 of 3, column 2 of 2.')).toBeVisible();

  // Format > Table: a column, then the header row off.
  await useTool(page, 'Add column right');
  await expect(table.locator('tr').first().locator('th')).toHaveCount(3);
  await useTool(page, 'Header row');
  await expect(table.locator('th')).toHaveCount(0);
  // The caret is in the row of Mira and Hull.
  await useTool(page, 'Delete row');
  await expect(table.locator('tr')).toHaveCount(2);
  await expect(table).toContainText('NamePort');
  await expect(table).not.toContainText('Mira');
  expect(await seriousIssues(page)).toEqual([]);

  // The table stays after a reload.
  await page.reload();
  await expect(scene(page).locator('table td')).toHaveCount(6);
  await expect(scene(page).locator('table')).toContainText('NamePort');

  await scene(page).locator('table td').first().click();
  await useTool(page, 'Delete table');
  await expect(scene(page).locator('table')).toHaveCount(0);
  await expect(scene(page)).toContainText('The crew.');
});
