import { expect, test, type Page } from '@playwright/test';
import { seriousIssues } from './support/axe';
import { skipOnboarding } from './support/onboarding';
import { openView } from './support/views';

/* Plan Task K8 (roadmap F59): a series of books. series.test.ts holds the backup and the leave rules. */

const scene = (page: Page) => page.getByRole('textbox', { name: 'Scene 1' });

async function novel(page: Page, title: string, text: string) {
  await page.getByRole('button', { name: 'New project' }).click();
  const dialog = page.getByRole('dialog', { name: 'New project' });
  await dialog.getByLabel('Title').fill(title);
  await dialog.getByRole('button', { name: 'Create project' }).click();
  await expect(scene(page)).toBeFocused();
  await page.keyboard.type(text);
  await expect(page.getByRole('status').filter({ hasText: /Saved/ })).toHaveText('Saved');
  await toLibrary(page);
}

async function toLibrary(page: Page) {
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Library' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Library' })).toBeVisible();
}

async function addToSeries(page: Page, title: string, seriesTitle?: string) {
  await page.getByRole('button', { name: `Options for ${title}` }).click();
  await page.getByRole('menuitem', { name: 'Add to a series' }).click();
  const dialog = page.getByRole('dialog', { name: 'Add to a series' });
  if (seriesTitle) {
    await dialog.getByLabel('Title of the series').fill(seriesTitle);
    await dialog.getByRole('button', { name: 'Make the series' }).click();
  } else await dialog.getByRole('button', { name: 'Add to the series' }).click();
  await expect(dialog).toBeHidden();
}

test('a series orders its books, shares a Codex entry and marks the forms its style sheet avoids', async ({
  page,
}) => {
  await skipOnboarding(page);
  await novel(page, 'Salt', 'Mira rowed out.');
  await novel(page, 'Tide', 'Mira saw the gray gulls.');
  await addToSeries(page, 'Salt', 'Tides');
  await addToSeries(page, 'Tide');

  await page.getByRole('region', { name: 'Series' }).getByRole('link', { name: 'Tides' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Tides' })).toBeVisible();
  await expect(page.getByText('2 books, 8 words')).toBeVisible();
  const books = page.getByRole('list', { name: 'Books in Tides' }).getByRole('listitem');
  await expect(books).toHaveCount(2);
  await page.getByRole('button', { name: 'Options for Tide' }).click();
  await page.getByRole('menuitem', { name: 'Move to the start' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'moved' })).toHaveText(
    'Tide moved. It is now book 1 of 2.',
  );
  await expect(books.getByRole('button', { name: /^(Salt|Tide)$/ })).toHaveText(['Tide', 'Salt']);

  await page.getByLabel('Use', { exact: true }).fill('grey');
  await page.getByLabel('Avoid').fill('gray');
  await page.getByRole('button', { name: 'Add rule' }).click();
  await expect(page.getByText('Use grey, not gray.')).toBeVisible();
  expect(await seriousIssues(page)).toEqual([]);

  // Salt shares its entry, and Tide shows it.
  await books.getByRole('button', { name: 'Salt', exact: true }).click();
  await openView(page, 'Codex');
  await page.getByRole('textbox', { name: 'Name' }).fill('Mira');
  await page.getByRole('button', { name: 'Add entry' }).click();
  await page.getByRole('switch', { name: 'Share with the series' }).click();
  await expect(page.getByRole('switch', { name: 'Share with the series' })).toBeChecked();
  expect(await seriousIssues(page)).toEqual([]);

  await toLibrary(page);
  await page.getByRole('link', { name: 'Tides' }).click();
  const matrix = page.getByRole('region', { name: 'Mentions' });
  await expect(matrix.getByRole('row', { name: /Mira/ }).getByRole('cell')).toHaveText(['1', '1']);
  await books.getByRole('button', { name: 'Tide', exact: true }).click();
  await page.getByRole('button', { name: 'More tools' }).click();
  await page.getByRole('menuitemcheckbox', { name: 'Style check' }).click();
  const mark = scene(page).locator('.vlo-style-sheet');
  await expect(mark).toHaveText(['gray']);
  await mark.click();
  await expect(page.locator('[data-vlo-cursor-note]')).toHaveText(
    'The series style sheet uses "grey" for "gray".',
  );
  await openView(page, 'Codex');
  await expect(
    page.getByRole('navigation', { name: 'Codex entries' }).getByRole('button', { name: 'Mira' }),
  ).toBeVisible();
});
