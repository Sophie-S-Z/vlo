import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { PDFDocument } from 'pdf-lib';
import { seriousIssues } from './support/axe';
import { skipOnboarding } from './support/onboarding';

/*
 * Plan Task J5 (roadmap F51): the Book screen lays out the project as a printed book, and the preview has
 * as many pages as the PDF. Review Focus 1.
 */

test('the preview follows the trim and chapter style, matches the PDF, and the settings stay', async ({
  page,
}) => {
  test.setTimeout(90_000);
  await skipOnboarding(page);
  await page.getByRole('button', { name: 'New project' }).click();
  await page
    .getByRole('dialog', { name: 'New project' })
    .getByRole('button', { name: 'Create project' })
    .click();
  await expect(page.getByRole('textbox', { name: 'Scene 1' })).toBeFocused();
  for (let i = 0; i < 12; i += 1) {
    await page.keyboard.type(
      'The harbor lights came on one by one while the boats came in, and the gulls argued over the nets.',
    );
    await page.keyboard.press('Enter');
  }
  await expect(page.getByRole('status').filter({ hasText: /Saved/ })).toHaveText('Saved');

  // The Simple tool level has no Book tab, so the command menu opens it.
  await page.keyboard.press('ControlOrMeta+k');
  const menu = page.getByRole('dialog', { name: 'Command menu' });
  await menu.getByRole('combobox').fill('Book');
  await menu.getByRole('option', { name: 'Open Book' }).click();
  await expect(page.getByRole('heading', { level: 2, name: 'Book' })).toBeVisible();

  const status = page.getByRole('status').filter({ hasText: /pages\.$/ });
  await expect(status).toBeVisible({ timeout: 30_000 });
  const firstPage = page.getByRole('img', { name: 'Page 1' });
  await expect(firstPage).toBeVisible();
  const before = await firstPage.boundingBox();

  await page.getByLabel('Trim size').selectOption('6x9');
  await page.getByRole('radio', { name: /Modern/ }).click();
  await page.getByLabel('Dedication').fill('For the keepers of the light.');
  await page.getByLabel('Dedication').blur();
  // A 6 x 9 page is wider for its height than a 5.5 x 8.5 page.
  await expect
    .poll(async () => {
      const box = await firstPage.boundingBox();
      return box && before ? box.width / box.height - before.width / before.height : 0;
    })
    .toBeGreaterThan(0.01);
  await expect(status).toBeVisible({ timeout: 30_000 });
  const pages = Number(/(\d+) pages/.exec((await status.textContent()) ?? '')?.[1]);
  expect(pages).toBeGreaterThan(4);
  expect(await seriousIssues(page)).toEqual([]);

  await page.getByRole('button', { name: 'Export the book' }).click();
  const dialog = page.getByRole('dialog', { name: 'Export' });
  await expect(dialog.getByRole('radio', { name: /PDF/ })).toBeChecked();
  await expect(dialog.getByRole('switch', { name: 'Book layout' })).toBeChecked();
  const download = page.waitForEvent('download');
  await dialog.getByRole('button', { name: 'Export' }).click();
  const pdf = await PDFDocument.load(await readFile(await (await download).path()));
  expect(pdf.getPageCount()).toBe(pages);
  expect(pdf.getPage(0).getSize()).toEqual({ width: 432, height: 648 });
  await page
    .getByRole('dialog', { name: 'Your file is ready' })
    .getByRole('button', { name: 'Done' })
    .click();

  await page.reload();
  await expect(page.getByLabel('Trim size')).toHaveValue('6x9');
  await expect(page.getByRole('radio', { name: /Modern/ })).toBeChecked();
  await expect(page.getByLabel('Dedication')).toHaveValue('For the keepers of the light.');
});
