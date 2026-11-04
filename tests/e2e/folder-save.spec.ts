import { chromium, expect, test, type Page } from '@playwright/test';
import { seriousIssues } from './support/axe';
import { skipOnboarding } from './support/onboarding';

/*
 * Plan Task B9 (spec F29): folder save. The test replaces the folder picker with a folder in the
 * browser's private file system, so it can read back what Vlo wrote. Only Chromium browsers have the
 * picker, so the other browsers check that Settings hides the controls.
 *
 * Chromium stops when a page reads a folder back from IndexedDB in a private (incognito) profile, and
 * each Playwright test context is one. So this test opens Chromium with a profile on disk.
 */

const TEXT = 'The harbour  lights came on one by one.';

/** Gives the picker a folder named Writing in the private file system of the page. */
async function fakePicker(page: Page) {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'showDirectoryPicker', {
      configurable: true,
      value: async () =>
        (await navigator.storage.getDirectory()).getDirectoryHandle('Writing', { create: true }),
    });
  });
}

/** The names of the files in Writing/<folder>, or null when the folder is not there. */
async function filesIn(page: Page, folder: string) {
  return page.evaluate(async (name) => {
    const root = await navigator.storage.getDirectory();
    try {
      const writing = await root.getDirectoryHandle('Writing');
      const target = await writing.getDirectoryHandle(name);
      const names: string[] = [];
      for await (const key of (target as unknown as { keys(): AsyncIterable<string> }).keys())
        names.push(key);
      return names.sort();
    } catch {
      return null;
    }
  }, folder);
}

async function readText(page: Page, folder: string, file: string) {
  return page.evaluate(
    async ([name, fileName]) => {
      const writing = await (await navigator.storage.getDirectory()).getDirectoryHandle('Writing');
      const target = await writing.getDirectoryHandle(name);
      return (await (await target.getFileHandle(fileName)).getFile()).text();
    },
    [folder, file] as const,
  );
}

async function openSettings(page: Page) {
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Settings' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Settings' })).toBeVisible();
}

test('after the writer picks a folder, leaving a project saves its backup and a Markdown copy there', async ({
  browserName,
}, testInfo) => {
  test.skip(browserName !== 'chromium', 'Only Chromium browsers can save to a folder.');
  // The device of the test project (desktop or phone), without the settings it leaves out.
  const { baseURL, viewport, userAgent, deviceScaleFactor, isMobile, hasTouch } = testInfo.project.use;
  const device = Object.fromEntries(
    Object.entries({ baseURL, viewport, userAgent, deviceScaleFactor, isMobile, hasTouch }).filter(
      ([, value]) => value !== undefined,
    ),
  ) as Parameters<typeof chromium.launchPersistentContext>[1];
  const context = await chromium.launchPersistentContext(testInfo.outputPath('profile'), device);
  try {
    await saveFlow(await context.newPage());
  } finally {
    await context.close();
  }
});

async function saveFlow(page: Page) {
  await fakePicker(page);
  await skipOnboarding(page);

  await openSettings(page);
  await expect(page.getByRole('heading', { name: 'Save to a folder' })).toBeVisible();
  await page.getByRole('button', { name: 'Choose a folder' }).click();
  await expect(page.getByText('Folder: Writing')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Stop saving to a folder' })).toBeVisible();
  expect(await seriousIssues(page)).toEqual([]);

  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Library' }).click();
  await page.getByRole('button', { name: 'New project' }).click();
  const dialog = page.getByRole('dialog', { name: 'New project' });
  await dialog.getByLabel('Title').fill('Salt Year');
  await dialog.getByRole('button', { name: 'Create project' }).click();
  await expect(page.getByRole('textbox', { name: 'Scene 1' })).toBeFocused();
  await page.keyboard.type(TEXT);
  await expect(page.getByRole('status').filter({ hasText: /Saved/ })).toHaveText('Saved');
  expect(await filesIn(page, 'Salt Year')).toBeNull();

  // Leaving the project saves it.
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Library' }).click();
  await expect.poll(() => filesIn(page, 'Salt Year')).toEqual(['Salt Year.md', 'Salt Year.vlo.zip']);
  expect(await readText(page, 'Salt Year', 'Salt Year.md')).toContain(TEXT);
  // The save counts as a backup.
  const card = page
    .getByRole('list', { name: 'Projects' })
    .getByRole('listitem')
    .filter({ has: page.getByRole('link', { name: 'Salt Year', exact: true }) });
  await expect(card).toContainText('Backed up today');

  await openSettings(page);
  await expect(page.getByRole('status').filter({ hasText: 'Last save' })).toContainText(
    'Last save: Salt Year,',
  );
  await page.getByRole('button', { name: 'Stop saving to a folder' }).click();
  await expect(page.getByRole('button', { name: 'Choose a folder' })).toBeVisible();
  // Vlo keeps the files in the folder.
  expect(await filesIn(page, 'Salt Year')).toEqual(['Salt Year.md', 'Salt Year.vlo.zip']);
}

test('browsers without the folder picker show no folder controls', async ({ page, browserName }) => {
  test.skip(browserName === 'chromium', 'Chromium has the folder picker.');
  await skipOnboarding(page);
  await openSettings(page);
  await expect(page.getByRole('heading', { name: 'Backups' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Save to a folder' })).toHaveCount(0);
});
