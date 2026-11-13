import { expect, test, type Page } from '@playwright/test';
import { docxBytes, SCRIVENER_FILES, zipOf } from '../fixtures/import';
import { seriousIssues } from './support/axe';
import { skipOnboarding } from './support/onboarding';

/* Plan Task G4 (roadmap F34): import from Word, Scrivener and a Markdown folder, and a damaged file. */

const dialog = (page: Page) => page.getByRole('dialog', { name: 'Import writing' });
const binder = (page: Page) => page.getByRole('navigation', { name: 'Binder' });

/** The binder titles in order, from the drag handle of each item. */
async function binderTitles(page: Page): Promise<string[]> {
  const labels = await binder(page)
    .getByRole('button', { name: /^Move / })
    .evaluateAll((buttons) => buttons.map((b) => b.getAttribute('aria-label') ?? ''));
  return labels.map((label) => label.replace(/^Move /, ''));
}

/** Under 600 px the binder is a drawer, so its button opens it. */
async function showBinder(page: Page, isMobile: boolean) {
  if (isMobile) await page.getByRole('button', { name: 'Binder' }).click();
  await expect(binder(page)).toBeVisible();
}

async function openImport(page: Page) {
  await skipOnboarding(page);
  await page.getByRole('button', { name: 'Import', exact: true }).click();
  await page.getByRole('menuitem', { name: /^Import writing/ }).click();
  await expect(dialog(page)).toBeVisible();
}

const pickFiles = (page: Page, name: string, bytes: Uint8Array) =>
  dialog(page)
    .locator('input[type="file"]:not([webkitdirectory])')
    .setInputFiles({ name, mimeType: 'application/octet-stream', buffer: Buffer.from(bytes) });

test('a Word file imports as a chapter with two scenes, with its marks, and the binder stays after a reload', async ({
  page,
  isMobile,
}) => {
  await openImport(page);
  await pickFiles(page, 'Salt Year.docx', await docxBytes());
  await expect(dialog(page).getByRole('status')).toContainText('Vlo found 2 texts with 9 words.');
  await expect(dialog(page).getByRole('status')).toContainText('Vlo leaves out: 1 table.');
  await expect(dialog(page).getByLabel('Title')).toHaveValue('Salt Year');
  expect(await seriousIssues(page)).toEqual([]);
  await dialog(page).getByRole('button', { name: 'Import', exact: true }).click();

  await showBinder(page, isMobile);
  const order = ['Chapter One', 'The ledger', 'The key'];
  await expect.poll(() => binderTitles(page)).toEqual(order);
  await page.reload();
  await showBinder(page, isMobile);
  await expect.poll(() => binderTitles(page)).toEqual(order);

  await binder(page).getByRole('button', { name: 'The ledger', exact: true }).click();
  const editor = page.getByRole('textbox', { name: 'The ledger' });
  await expect(editor).toContainText('Mira counted the coins twice');
  await expect(editor.locator('strong')).toHaveText('Mira');
  await expect(editor.locator('sup[data-footnote]')).toHaveCount(1);
});

test('a zipped Scrivener project imports its Draft in binder order', async ({ page, isMobile }) => {
  await openImport(page);
  await pickFiles(page, 'Salt Year.scriv.zip', await zipOf(SCRIVENER_FILES));
  await expect(dialog(page).getByRole('status')).toContainText('Vlo found 3 texts');
  await dialog(page).getByRole('button', { name: 'Import', exact: true }).click();
  await showBinder(page, isMobile);
  await expect(binder(page).getByRole('button', { name: 'Move The key' })).toBeVisible();
  const titles = await binderTitles(page);
  expect(titles.slice(0, 3)).toEqual(['Chapter One', 'The ledger', 'The key']);
  expect(titles).not.toContain('Old opening');
});

test('a Markdown folder imports as pages in name order, and other files are in the summary', async ({
  page,
  isMobile,
}) => {
  await openImport(page);
  await dialog(page).locator('input[webkitdirectory]').setInputFiles('tests/fixtures/novel');
  await expect(dialog(page).getByRole('status')).toContainText('Vlo found 6 texts');
  await expect(dialog(page).getByRole('status')).toContainText('Vlo leaves out: 1 other file.');
  await dialog(page).getByLabel('Title').fill("The Keeper's Debt");
  await dialog(page)
    .getByRole('checkbox', { name: /^Open writing/ })
    .click();
  await dialog(page).getByRole('button', { name: 'Import', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name: "The Keeper's Debt" })).toBeVisible();
  await showBinder(page, isMobile);
  await expect.poll(() => binderTitles(page)).toEqual(['1-1', '1-2', '2-1', '2-2', '3-1', '3-2']);
});

test('a damaged file shows a message and adds no project', async ({ page }) => {
  await openImport(page);
  await pickFiles(page, 'broken.docx', new TextEncoder().encode('not a Word file'));
  await expect(dialog(page).getByRole('alert')).toHaveText(
    'This file is not a Word file. Save it as .docx in Word, then import it.',
  );
  await dialog(page).getByRole('button', { name: 'Cancel' }).click();
  await page.reload();
  await expect(page.getByText('Your projects will live here, on this device.')).toBeVisible();
});
