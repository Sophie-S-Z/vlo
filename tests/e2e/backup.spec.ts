import { readFile, writeFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import JSZip from 'jszip';
import { seriousIssues } from './support/axe';
import { skipOnboarding } from './support/onboarding';
import { ageProjects } from './support/seed';

/* Plan Task B8 and US04: back up a project, import it in a fresh profile, the reminder and the Safari steps. */

const TEXT = 'The harbour  lights came on one by one.';
const DAY = 86_400_000;
/** The editor may show the double space as a space and a no-break space. */
const SHOWN = /The harbour\s+lights came on one by one\./;

async function novelWithText(page: Page) {
  await skipOnboarding(page);
  await page.getByRole('button', { name: 'New project' }).click();
  const dialog = page.getByRole('dialog', { name: 'New project' });
  await dialog.getByLabel('Title').fill('Salt Year');
  await dialog.getByRole('button', { name: 'Create project' }).click();
  await expect(page.getByRole('textbox', { name: 'Scene 1' })).toBeFocused();
  await page.keyboard.type(TEXT);
  await expect(page.getByRole('status').filter({ hasText: /Saved/ })).toHaveText('Saved');
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Library' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Library' })).toBeVisible();
}

const card = (page: Page, title = 'Salt Year') =>
  page
    .getByRole('list', { name: 'Projects' })
    .getByRole('listitem')
    .filter({ has: page.getByRole('link', { name: title, exact: true }) });

/** Backs up from the card menu and gives the file's name, path and bytes. */
async function backUp(page: Page) {
  await card(page).getByRole('button', { name: 'Options for Salt Year' }).click();
  await page.getByRole('menuitem', { name: 'Back up' }).click();
  const dialog = page.getByRole('dialog', { name: 'Back up Salt Year' });
  await expect(dialog).toBeVisible();
  const download = page.waitForEvent('download');
  await dialog.getByRole('button', { name: 'Download backup' }).click();
  const file = await download;
  const path = await file.path();
  return { name: file.suggestedFilename(), path, bytes: await readFile(path) };
}

/** Picks a file for Import backup. */
async function importFile(page: Page, path: string) {
  await page.locator('input[type="file"]').setInputFiles(path);
}

test('a backup holds the project, and the card shows the backup date', async ({ page }) => {
  await novelWithText(page);
  await expect(card(page)).toContainText('No backup yet');
  const { name, bytes } = await backUp(page);
  expect(name).toMatch(/^Salt Year backup \d{4}-\d{2}-\d{2}\.vlo\.zip$/);
  const zip = await JSZip.loadAsync(bytes);
  const manifest = JSON.parse((await zip.file('project.json')?.async('string')) ?? '{}') as {
    format: string;
    project: { title: string };
    items: { id: string; kind: string }[];
  };
  expect(manifest.format).toBe('vlo-backup');
  expect(manifest.project.title).toBe('Salt Year');
  const scene = manifest.items.find((i) => i.kind === 'scene');
  expect(await zip.file(`items/${scene?.id ?? ''}.md`)?.async('string')).toContain(TEXT);
  expect(zip.file(`items/${scene?.id ?? ''}.yjs`)).not.toBeNull();

  const done = page.getByRole('dialog', { name: 'Your backup is ready' });
  await expect(done).toContainText(`Vlo saved ${name} to your downloads.`);
  expect(await seriousIssues(page)).toEqual([]);
  await done.getByRole('button', { name: 'Done' }).click();
  await expect(card(page)).toContainText('Backed up today');
});

test('a backup imported in a fresh profile gives the same project and text (US04)', async ({
  page,
  browser,
}) => {
  await novelWithText(page);
  const { path } = await backUp(page);

  const fresh = await browser.newContext();
  try {
    const other = await fresh.newPage();
    await skipOnboarding(other);
    await importFile(other, path);
    await expect(other).toHaveURL(/\/p\/[0-9a-f-]{36}/);
    await expect(other.getByRole('heading', { level: 1, name: 'Salt Year' })).toBeVisible();
    await expect(other.getByRole('textbox', { name: 'Scene 1' })).toHaveText(SHOWN);
    await other.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Library' }).click();
    await expect(card(other)).toContainText('Backed up today');
  } finally {
    await fresh.close();
  }
});

test('importing a project that is here asks first: keep both, or replace it', async ({ page }) => {
  await novelWithText(page);
  const { path } = await backUp(page);
  await page
    .getByRole('dialog', { name: 'Your backup is ready' })
    .getByRole('button', { name: 'Done' })
    .click();

  await importFile(page, path);
  const ask = page.getByRole('alertdialog', { name: 'Salt Year is already on this device' });
  await expect(ask).toBeVisible();
  expect(await seriousIssues(page)).toEqual([]);
  await ask.getByRole('button', { name: 'Keep both' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Salt Year (copy)' })).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Scene 1' })).toHaveText(SHOWN);

  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Library' }).click();
  await expect(page.getByRole('list', { name: 'Projects' }).getByRole('listitem')).toHaveCount(2);
  await importFile(page, path);
  await page
    .getByRole('alertdialog', { name: 'Salt Year is already on this device' })
    .getByRole('button', { name: 'Replace' })
    .click();
  await expect(page.getByRole('heading', { level: 1, name: 'Salt Year' })).toBeVisible();
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Library' }).click();
  await expect(page.getByRole('list', { name: 'Projects' }).getByRole('listitem')).toHaveCount(2);
});

test('a file that is not a backup gets a clear message', async ({ page }, testInfo) => {
  await skipOnboarding(page);
  const path = testInfo.outputPath('notes.zip');
  const zip = new JSZip();
  zip.file('notes.txt', 'Not a backup.');
  await writeFile(path, await zip.generateAsync({ type: 'uint8array' }));
  await importFile(page, path);
  const error = page.getByRole('alertdialog', { name: 'Vlo cannot import this file' });
  await expect(error).toContainText(
    'This file is not a Vlo backup. A backup is a .vlo.zip file that Vlo made.',
  );
  await error.getByRole('button', { name: 'OK' }).click();
  await expect(error).toBeHidden();
  await expect(page.getByRole('button', { name: 'Import backup' })).toBeEnabled();
});

test('after a change with no folder save, the Library asks for a backup, and one press makes it', async ({
  page,
}) => {
  await novelWithText(page);
  const reminder = page.getByRole('region', { name: 'Time for a backup' });
  await expect(reminder).toContainText('This project has work that is not in a backup file.');
  await expect(card(page)).toContainText('No backup yet');
  expect(await seriousIssues(page)).toEqual([]);
  const download = page.waitForEvent('download');
  await reminder.getByRole('button', { name: 'Back up Salt Year' }).click();
  expect((await download).suggestedFilename()).toMatch(/^Salt Year backup \d{4}-\d{2}-\d{2}\.vlo\.zip$/);
  await expect(reminder).toBeHidden();
  await expect(page.getByRole('status').filter({ hasText: 'to your downloads' })).toContainText(
    'Vlo saved Salt Year backup',
  );
  await expect(card(page)).toContainText('Backed up today');
});

test('a project with no change and no backup after 7 days gets the reminder too', async ({ page }) => {
  await skipOnboarding(page);
  await page.getByRole('button', { name: 'New project' }).click();
  const dialog = page.getByRole('dialog', { name: 'New project' });
  await dialog.getByLabel('Title').fill('Salt Year');
  await dialog.getByRole('button', { name: 'Create project' }).click();
  await expect(page.getByRole('textbox', { name: 'Scene 1' })).toBeFocused();
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Library' }).click();
  const reminder = page.getByRole('region', { name: 'Time for a backup' });
  await expect(card(page)).toBeVisible();
  await expect(reminder).toHaveCount(0);
  await ageProjects(page, 8 * DAY);
  await page.reload();
  await expect(reminder).toContainText('This project has work that is not in a backup file.');
});

const SAFARI_MAC =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15';

test('other browsers show no install steps', async ({ page, browserName }) => {
  test.skip(browserName === 'webkit', 'Playwright WebKit says it is Safari.');
  await skipOnboarding(page);
  await expect(page.getByRole('region', { name: 'Install Vlo to keep your work' })).toHaveCount(0);
});

test('Safari shows the steps to install Vlo, and the writer can close them', async ({ browser }) => {
  // The steps depend only on the user agent, so every browser can show them as Safari would.
  const safari = await browser.newContext({ userAgent: SAFARI_MAC });
  try {
    const page = await safari.newPage();
    await skipOnboarding(page);
    const steps = page.getByRole('region', { name: 'Install Vlo to keep your work' });
    await expect(steps).toContainText('In the Safari menu bar, choose File, then Add to Dock.');
    expect(await seriousIssues(page)).toEqual([]);
    await steps.getByRole('button', { name: 'Close the install steps' }).click();
    await expect(steps).toBeHidden();
    await page.reload();
    await expect(page.getByRole('heading', { level: 1, name: 'Library' })).toBeVisible();
    await expect(steps).toHaveCount(0);
    // Settings always shows them.
    await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Settings' }).click();
    await expect(steps).toBeVisible();
  } finally {
    await safari.close();
  }
});
