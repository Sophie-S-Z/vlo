import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import { seriousIssues } from './support/axe';
import { skipOnboarding } from './support/onboarding';
import { editorSelection } from './support/selection';

/*
 * Plan Task C5: people and private names (spec 8.2, US06). The writer gives each real person an alias,
 * marks the names, previews the aliases, and exports a file with no real name in it.
 */

const REAL = /Rosa|Teo/g;
const text = (page: Page) => page.getByRole('textbox', { name: 'Memory 1' });

async function newMemoir(page: Page) {
  await skipOnboarding(page);
  await page.getByRole('button', { name: 'New project' }).click();
  const dialog = page.getByRole('dialog', { name: 'New project' });
  await dialog.getByRole('checkbox', { name: /Memoir/ }).click();
  await dialog.getByRole('button', { name: 'Create project' }).click();
  await expect(text(page)).toBeFocused();
}

async function saved(page: Page) {
  await expect(page.getByRole('status').filter({ hasText: /Saved/ })).toHaveText('Saved');
}

async function tab(page: Page, name: string) {
  await page.getByRole('navigation', { name: 'Project views' }).getByRole('link', { name }).click();
}

async function addPerson(page: Page, real: string, alias: string) {
  const form = page.getByRole('form', { name: 'Add a person' });
  await form.getByLabel('Real name').fill(real);
  await form.getByLabel('Alias').fill(alias);
  await form.getByRole('button', { name: 'Add person' }).click();
  await expect(page.getByRole('heading', { level: 2, name: real })).toBeVisible();
}

async function addName(page: Page, person: string, real: string, alias: string) {
  const form = page.getByRole('form', { name: `Add a name for ${person}` });
  await form.getByLabel(`Another real name for ${person}`).fill(real);
  await form.getByLabel(`Its alias for ${person}`).fill(alias);
  await form.getByRole('button', { name: 'Add name' }).click();
  await expect(page.getByLabel(`Alias for ${real}`)).toHaveValue(alias);
}

/** Runs the export as Markdown and gives the downloaded file's text. */
async function exportMarkdown(page: Page, button = 'Export'): Promise<{ name: string; text: string }> {
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: button, exact: true }).click();
  const file = await download;
  return { name: file.suggestedFilename(), text: await readFile(await file.path(), 'utf8') };
}

async function openExport(page: Page) {
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Export' });
  await dialog.getByRole('radio', { name: /Markdown/ }).click();
  await expect(dialog.getByRole('switch', { name: 'Share-safe export' })).toBeChecked();
  return dialog;
}

async function moreTool(page: Page, name: string) {
  await page.getByRole('button', { name: 'More tools' }).click();
  await page.getByRole('menuitemcheckbox', { name }).click();
}

test('US06: Mark all, Show aliases and a share-safe export with no real name', async ({ page }) => {
  await newMemoir(page);
  await page.keyboard.type(
    'Aunt Rosa drove us to the coast in the summer of 1994. Uncle Teo stayed behind with the dog.',
  );
  await page.keyboard.press('Enter');
  await page.keyboard.type(
    'Rosa never said why. Years later, Teo told me it was the only time she ever left the city.',
  );
  await saved(page);

  await tab(page, 'People');
  await expect(page).toHaveTitle(/People/);
  await expect(page.getByText('No people yet. Add the first person above.')).toBeVisible();
  await addPerson(page, 'Aunt Rosa', 'Aunt Maria');
  await addName(page, 'Aunt Rosa', 'Rosa', 'Maria');
  await addPerson(page, 'Uncle Teo', 'Uncle Sam');
  await addName(page, 'Uncle Teo', 'Teo', 'Sam');
  await expect(page.getByTestId('unmarked-count')).toHaveText('4 real names in the text with no mark.');
  expect(await seriousIssues(page)).toEqual([]);

  await page.getByRole('button', { name: 'Mark all names' }).click();
  await expect(page.locator('p[role="status"]').first()).toHaveText('Marked 4 names in 1 item.');
  await expect(page.getByTestId('unmarked-count')).toHaveText('Every real name in the text has a mark.');
  await expect(page.getByText('2 marked names in the text')).toHaveCount(2);

  await tab(page, 'Write');
  await expect(text(page).locator('.vlo-name')).toHaveText(['Aunt Rosa', 'Uncle Teo', 'Rosa', 'Teo']);
  await text(page).click();
  await moreTool(page, 'Show aliases');
  await expect(text(page).locator('.vlo-alias')).toHaveText(['Aunt Maria', 'Uncle Sam', 'Maria', 'Sam']);
  await expect(text(page)).toContainText('Aunt Maria drove us to the coast', { useInnerText: true });
  // The preview never changes the text.
  await expect(text(page).locator('.vlo-name')).toHaveCount(4);
  await moreTool(page, 'Show aliases');
  await expect(text(page).locator('.vlo-alias')).toHaveCount(0);

  await openExport(page);
  const { name, text: file } = await exportMarkdown(page);
  expect(name).toBe('Memory 1.md');
  expect(file.match(REAL)).toBeNull();
  expect(file).toContain('Aunt Maria drove us to the coast in the summer of 1994. Uncle Sam stayed behind');
  expect(file).toContain('Maria never said why. Years later, Sam told me');
});

test('Mark as person from the selection, then the name check before export (E5)', async ({ page }) => {
  await newMemoir(page);
  await page.keyboard.type('Dear Rosa');
  for (let i = 0; i < 4; i += 1) await page.keyboard.press('Shift+ArrowLeft');
  await expect.poll(async () => (await editorSelection(text(page))).text).toBe('Rosa');
  const menu = page.getByRole('toolbar', { name: 'Selection formatting' });
  await menu.getByRole('button', { name: 'Mark as person' }).click();

  const panel = page.getByRole('dialog', { name: 'Mark as person' });
  await expect(panel.getByLabel('Real name')).toHaveValue('Rosa');
  await panel.getByLabel('Alias').fill('Maria');
  await panel.getByRole('button', { name: 'Add and mark' }).click();
  await expect(panel).toBeHidden();
  await expect(text(page).locator('.vlo-name')).toHaveText(['Rosa']);
  expect(await seriousIssues(page)).toEqual([]);

  // Typing after a marked name is not part of the name. A second "Rosa" has no mark.
  await page.keyboard.press('End');
  await page.keyboard.type(', the sea took Rosa’s hat.');
  await expect(text(page).locator('.vlo-name')).toHaveText(['Rosa']);
  await saved(page);

  const dialog = await openExport(page);
  await dialog.getByRole('button', { name: 'Export', exact: true }).click();
  const check = page.getByRole('dialog', { name: 'Check the private names' });
  await expect(check.getByRole('listitem')).toHaveText([/Rosa\s*1 time/]);
  expect(await seriousIssues(page)).toEqual([]);
  await check.getByRole('button', { name: 'Mark all 1 name' }).click();
  await expect(check.getByRole('status')).toHaveText('Marked 1 name.');
  await expect(page.locator('.vlo-manuscript .vlo-name')).toHaveText(['Rosa', 'Rosa']);

  const { text: file } = await exportMarkdown(page, 'Export with aliases');
  expect(file.match(REAL)).toBeNull();
  expect(file).toContain('Dear Maria, the sea took Maria’s hat.');
});

test('the People screen deletes a person with undo, and the marks find the person again', async ({
  page,
}) => {
  await newMemoir(page);
  await page.keyboard.type('Teo left early.');
  await saved(page);
  await tab(page, 'People');
  await addPerson(page, 'Teo', 'Sam');
  await page.getByRole('button', { name: 'Mark all names' }).click();
  await expect(page.getByText('1 marked name in the text')).toBeVisible();

  await page.getByRole('button', { name: 'Delete Teo' }).click();
  const undo = page.getByRole('button', { name: 'Undo' });
  await expect(undo).toBeFocused();
  await expect(page.getByRole('heading', { level: 2, name: 'Teo' })).toHaveCount(0);
  await undo.click();
  await expect(page.locator('p[role="status"]').first()).toHaveText('Restored Teo.');
  await expect(page.getByText('1 marked name in the text')).toBeVisible();

  // A real name belongs to one person.
  const form = page.getByRole('form', { name: 'Add a person' });
  await form.getByLabel('Real name').fill('Teo');
  await form.getByLabel('Alias').fill('Tom');
  await form.getByRole('button', { name: 'Add person' }).click();
  await expect(form.getByRole('alert')).toHaveText('Teo is a name of another person in this project.');
  expect(await seriousIssues(page)).toEqual([]);
});
