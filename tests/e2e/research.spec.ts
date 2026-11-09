import { expect, test, type Page } from '@playwright/test';
import { seriousIssues } from './support/axe';
import { skipOnboarding } from './support/onboarding';

/* Plan Task H6 (roadmap F41): the research folder. research.test.ts holds the backup round trip. */

const binder = (page: Page) => page.getByRole('navigation', { name: 'Binder' });
const files = (page: Page) => binder(page).getByRole('list', { name: 'Research files' });

// A 1 by 1 PNG.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

test('a writer adds an image and a clipping, opens, renames and deletes them, and nothing is fetched', async ({
  page,
  isMobile,
}) => {
  const requests: string[] = [];
  page.on('request', (request) => {
    // The page itself and the blob: URLs of the files are on this device.
    if (!/^(blob:|data:|http:\/\/localhost)/.test(request.url())) requests.push(request.url());
  });
  await skipOnboarding(page);
  await page.getByRole('button', { name: 'New project' }).click();
  await page
    .getByRole('dialog', { name: 'New project' })
    .getByRole('button', { name: 'Create project' })
    .click();
  await expect(page.getByRole('heading', { level: 2, name: 'Scene 1' })).toBeVisible();
  if (isMobile) await page.getByRole('button', { name: 'Binder' }).click();

  await page
    .getByTestId('research-input')
    .setInputFiles({ name: 'harbour.png', mimeType: 'image/png', buffer: PNG });
  await expect(page.getByRole('heading', { level: 2, name: 'harbour.png' })).toBeVisible();
  await expect(page.getByRole('img', { name: 'harbour.png' })).toHaveJSProperty('naturalWidth', 1);
  expect(await seriousIssues(page)).toEqual([]);

  // A PDF shows in a frame from a blob: URL, which the CSP allows (frame-src blob:).
  const refused: string[] = [];
  page.on('console', (message) => {
    if (message.text().includes('Content Security Policy')) refused.push(message.text());
  });
  if (isMobile) await page.getByRole('button', { name: 'Binder' }).click();
  await page.getByTestId('research-input').setInputFiles({
    name: 'chart.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from('%PDF-1.4\n%%EOF\n'),
  });
  await expect(page.locator('iframe[title="chart.pdf"]')).toHaveAttribute('src', /^blob:/);
  await expect(page.getByRole('button', { name: 'Download chart.pdf' })).toBeVisible();
  expect(refused).toEqual([]);

  if (isMobile) await page.getByRole('button', { name: 'Binder' }).click();
  await binder(page).getByRole('button', { name: 'Add research' }).click();
  await page.getByRole('menuitem', { name: 'Clipping…' }).click();
  const dialog = page.getByRole('dialog', { name: 'Add a clipping' });
  await dialog.getByRole('textbox', { name: 'Text' }).fill('Tides turn twice a day.');
  await dialog.getByRole('textbox', { name: 'Link (optional)' }).fill('https://example.com/tides');
  await dialog.getByRole('button', { name: 'Add clipping' }).click();
  await expect(page.getByRole('heading', { level: 2, name: 'Tides turn twice a day.' })).toBeVisible();
  await expect(page.getByText('https://example.com/tides')).toBeVisible();

  await page.getByRole('textbox', { name: 'Name' }).fill('Tides');
  await page.getByRole('textbox', { name: 'Name' }).press('Tab');
  await expect(page.getByRole('heading', { level: 2, name: 'Tides', exact: true })).toBeVisible();

  await page.reload();
  await expect(page.getByRole('heading', { level: 2, name: 'Tides', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Delete Tides' }).click();
  await page
    .getByRole('alertdialog', { name: 'Delete Tides?' })
    .getByRole('button', { name: 'Delete file' })
    .click();
  await expect(page.getByRole('heading', { level: 2, name: 'Scene 1' })).toBeVisible();
  if (isMobile) await page.getByRole('button', { name: 'Binder' }).click();
  await expect(files(page).getByRole('button')).toHaveText(['harbour.png', 'chart.pdf']);
  expect(requests).toEqual([]);
});
