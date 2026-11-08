import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import JSZip from 'jszip';
import { PDFDict, PDFDocument, PDFName } from 'pdf-lib';
import { seriousIssues } from './support/axe';
import { skipOnboarding } from './support/onboarding';

/* Plan Tasks B1 to B3: the export dialog makes Word, PDF, EPUB and Markdown files from the stored text. */

const mod = process.platform === 'darwin' ? 'Meta' : 'Control';

async function newProject(page: Page, kind: 'novel' | 'poetry') {
  await skipOnboarding(page);
  await page.getByRole('button', { name: 'New project' }).click();
  const dialog = page.getByRole('dialog', { name: 'New project' });
  if (kind === 'poetry') await dialog.getByRole('checkbox', { name: /Poetry collection/ }).click();
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

test('a PDF export holds the text with its fonts, and has no Google Docs steps', async ({ page }) => {
  await newProject(page, 'novel');
  await page.keyboard.type('The harbour lights came on one by one.');
  await saved(page);

  await page.getByRole('button', { name: 'Export' }).click();
  const dialog = page.getByRole('dialog', { name: 'Export' });
  await dialog.getByRole('radio', { name: /PDF/ }).click();
  expect(await seriousIssues(page)).toEqual([]);
  const { name, bytes } = await exportFile(page);
  expect(name).toBe('Scene 1.pdf');
  expect(bytes.subarray(0, 5).toString('latin1')).toBe('%PDF-');
  const pdf = await PDFDocument.load(bytes);
  expect(pdf.getPageCount()).toBe(1);
  // The text font goes in the file, so the PDF looks the same on every computer.
  const embedded = pdf.context
    .enumerateIndirectObjects()
    .map(([, object]) => object)
    .filter((object): object is PDFDict => object instanceof PDFDict && object.has(PDFName.of('FontFile2')))
    .map((descriptor) => descriptor.get(PDFName.of('FontName'))?.toString() ?? '');
  expect(embedded.some((font) => font.includes('Newsreader'))).toBe(true);

  const done = page.getByRole('dialog', { name: 'Your file is ready' });
  await expect(done).toContainText('Vlo saved Scene 1.pdf to your downloads.');
  await expect(done.getByRole('heading', { name: 'Open it in Google Docs' })).toHaveCount(0);
  expect(await seriousIssues(page)).toEqual([]);
});

test('an EPUB export of a poem is a valid e-book file, and says how to read it on a Kindle', async ({
  page,
}) => {
  await newProject(page, 'poetry');
  await page.keyboard.type('Salt on the sill.');
  await page.keyboard.press('Enter');
  await page.keyboard.type('    The tide goes out');
  await saved(page);

  await page.getByRole('button', { name: 'Export' }).click();
  const dialog = page.getByRole('dialog', { name: 'Export' });
  await dialog.getByRole('radio', { name: /EPUB/ }).click();
  // Standard manuscript format is for novels only.
  await expect(dialog.getByRole('switch', { name: 'Standard manuscript format' })).toHaveCount(0);
  const { name, bytes } = await exportFile(page);
  expect(name).toBe('Poem 1.epub');
  // The first entry of an EPUB is the uncompressed mimetype file.
  expect(bytes.subarray(30, 38).toString('latin1')).toBe('mimetype');
  const zip = await JSZip.loadAsync(bytes);
  expect(await zip.file('mimetype')?.async('string')).toBe('application/epub+zip');
  const text = (await zip.file('OEBPS/text/part-1.xhtml')?.async('string')) ?? '';
  expect(text).toContain('\u00a0\u00a0\u00a0\u00a0The tide goes out');

  const done = page.getByRole('dialog', { name: 'Your file is ready' });
  await expect(done).toContainText('Send to Kindle');
  await expect(done.getByRole('heading', { name: 'What changes in this format' })).toBeVisible();
  expect(await seriousIssues(page)).toEqual([]);
});

test('standard manuscript format asks for a name, and the next export starts with the same details', async ({
  page,
}) => {
  await newProject(page, 'novel');
  await page.keyboard.type('The harbour lights came on one by one.');
  await saved(page);

  await page.getByRole('button', { name: 'Export' }).click();
  const dialog = page.getByRole('dialog', { name: 'Export' });
  const manuscript = dialog.getByRole('switch', { name: 'Standard manuscript format' });
  await expect(manuscript).not.toBeChecked();
  await manuscript.click();
  const name = dialog.getByRole('textbox', { name: 'Your name' });
  await name.fill('');
  await dialog.getByRole('button', { name: 'Export', exact: true }).click();
  await expect(dialog.getByRole('alert')).toHaveText('Type the name for the first page and the page header.');
  await expect(name).toBeFocused();
  await expect(name).toHaveAttribute('aria-invalid', 'true');
  expect(await seriousIssues(page)).toEqual([]);

  await name.fill('Ada Marlow');
  await expect(dialog.getByRole('alert')).toHaveCount(0);
  await dialog.getByRole('textbox', { name: 'Contact lines' }).fill('12 Quay Street\nada@example.org');
  const { bytes } = await exportFile(page);
  const zip = await JSZip.loadAsync(bytes);
  const xml = (await zip.file('word/document.xml')?.async('string')) ?? '';
  expect(xml).toContain('<w:t xml:space="preserve">Ada Marlow</w:t>');
  expect(xml).toContain('ada@example.org');
  expect(xml).toContain('about 100 words');
  expect(xml).toContain('<w:titlePg/>');

  const done = page.getByRole('dialog', { name: 'Your file is ready' });
  // Plain text loses nothing in the plain format, so the only notice names the font.
  await expect(done.getByRole('listitem')).toHaveText([
    'The file names the font Newsreader. A computer without it shows a similar font. Newsreader is free from Google Fonts.',
    /New, then File upload/,
    /Save as Google Docs/,
  ]);
  await done.getByRole('button', { name: 'Done' }).click();

  await page.getByRole('button', { name: 'Export' }).click();
  await expect(dialog.getByRole('switch', { name: 'Standard manuscript format' })).toBeChecked();
  await expect(dialog.getByRole('textbox', { name: 'Your name' })).toHaveValue('Ada Marlow');
  await expect(dialog.getByRole('textbox', { name: 'Contact lines' })).toHaveValue(
    '12 Quay Street\nada@example.org',
  );
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
