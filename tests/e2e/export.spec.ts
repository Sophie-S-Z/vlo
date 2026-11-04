import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import JSZip from 'jszip';
import { seriousIssues } from './support/axe';
import { skipOnboarding } from './support/onboarding';

/* Plan Tasks B1 to B3: the export dialog makes Word and Markdown files from the stored text. */

const mod = process.platform === 'darwin' ? 'Meta' : 'Control';

async function newProject(page: Page, kind: 'novel' | 'poetry') {
  await skipOnboarding(page);
  await page.getByRole('button', { name: 'New project' }).click();
  const dialog = page.getByRole('dialog', { name: 'New project' });
  if (kind === 'poetry') await dialog.getByRole('radio', { name: /Poetry collection/ }).click();
  await dialog.getByRole('button', { name: 'Create project' }).click();
  await expect(page.getByRole('textbox', { name: kind === 'poetry' ? 'Poem 1' : 'Scene 1' })).toBeFocused();
}

async function saved(page: Page) {
  await expect(page.getByRole('status').filter({ hasText: /Saved/ })).toHaveText('Saved');
}

/** Runs the export and gives the downloaded file's name and bytes. */
async function exportFile(page: Page): Promise<{ name: string; bytes: Buffer }> {
  const dialog = page.getByRole('dialog', { name: 'Export' });
  const download = page.waitForEvent('download');
  await dialog.getByRole('button', { name: 'Export', exact: true }).click();
  const file = await download;
  const path = await file.path();
  return { name: file.suggestedFilename(), bytes: await readFile(path) };
}

test('a Word export holds the text, and the dialog shows the two steps to Google Docs', async ({ page }) => {
  await newProject(page, 'novel');
  await page.keyboard.type('The harbour  lights came on one by one.');
  await saved(page);

  await page.getByRole('button', { name: 'Export' }).click();
  const dialog = page.getByRole('dialog', { name: 'Export' });
  await expect(dialog.getByRole('radio', { name: /Word/ })).toBeChecked();
  await expect(dialog.getByRole('radio', { name: /This scene: Scene 1/ })).toBeChecked();
  expect(await seriousIssues(page)).toEqual([]);

  const { name, bytes } = await exportFile(page);
  expect(name).toBe('Scene 1.docx');
  const zip = await JSZip.loadAsync(bytes);
  const xml = (await zip.file('word/document.xml')?.async('string')) ?? '';
  expect(xml).toContain('<w:t xml:space="preserve">The harbour  lights came on one by one.</w:t>');

  const done = page.getByRole('dialog', { name: 'Your file is ready' });
  await expect(done).toContainText('Vlo saved Scene 1.docx to your downloads.');
  await expect(done.getByRole('heading', { name: 'Open it in Google Docs' })).toBeVisible();
  await expect(done.getByRole('link', { name: 'Google Drive' })).toHaveAttribute(
    'href',
    'https://drive.google.com/',
  );
  await expect(done.getByRole('listitem')).toHaveCount(3);
  expect(await seriousIssues(page)).toEqual([]);
  await done.getByRole('button', { name: 'Done' }).click();
  await expect(done).toBeHidden();
});

test('a Markdown export of a poem keeps every leading space as a no-break space', async ({ page }) => {
  await newProject(page, 'poetry');
  await page.keyboard.type('Salt on the sill.');
  await page.keyboard.press('Enter');
  await page.keyboard.type('    The tide goes out');
  await saved(page);

  await page.getByRole('button', { name: 'Export' }).click();
  const dialog = page.getByRole('dialog', { name: 'Export' });
  await dialog.getByRole('radio', { name: /Markdown/ }).click();
  await dialog.getByRole('radio', { name: /The whole project/ }).click();
  const { name, bytes } = await exportFile(page);
  expect(name).toMatch(/\.md$/);
  const text = bytes.toString('utf8');
  expect(text).toContain('Salt on the sill.\\\n    The tide goes out\n');

  const done = page.getByRole('dialog', { name: 'Your file is ready' });
  await expect(done.getByRole('heading', { name: 'Open it in Google Docs' })).toHaveCount(0);
});

test('the command menu opens the export dialog', async ({ page }) => {
  await newProject(page, 'novel');
  await page.keyboard.press(`${mod}+k`);
  const menu = page.getByRole('dialog', { name: 'Command menu' });
  await menu.getByRole('combobox').fill('google docs');
  await menu.getByRole('option', { name: 'Export…' }).click();
  await expect(menu).toBeHidden();
  await expect(page.getByRole('dialog', { name: 'Export' })).toBeVisible();
});
