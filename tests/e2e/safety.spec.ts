import { expect, test, type Page } from '@playwright/test';
import { seriousIssues } from './support/axe';
import { skipOnboarding } from './support/onboarding';
import { ageProjects } from './support/seed';

/* The safety badge (roadmap F31, plan Task G1). */

const DAY = 86_400_000;
const SAFARI_MAC =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15';

const badge = (page: Page) => page.getByRole('banner').getByRole('button', { name: /^Safety:/ });

async function newNovel(page: Page) {
  await page.getByRole('button', { name: 'New project' }).click();
  const dialog = page.getByRole('dialog', { name: 'New project' });
  await dialog.getByLabel('Title').fill('Salt Year');
  await dialog.getByRole('button', { name: 'Create project' }).click();
  await expect(page.getByRole('textbox', { name: 'Scene 1' })).toBeFocused();
}

test('the badge shows only with a project, and a due backup turns it to Check until the backup', async ({
  page,
  browserName,
}) => {
  test.skip(browserName === 'webkit', 'Playwright WebKit says it is Safari, so the badge says At risk.');
  const outside: string[] = [];
  page.on('request', (request) => {
    if (!request.url().startsWith('http://localhost:4173')) outside.push(request.url());
  });
  await skipOnboarding(page);
  await expect(badge(page)).toHaveCount(0);

  await newNovel(page);
  await expect(badge(page)).toHaveText('Safety: Safe');

  await ageProjects(page, 8 * DAY);
  await page.reload();
  await expect(badge(page)).toHaveText('Safety: Check');
  await badge(page).click();
  const popover = page.getByRole('dialog', { name: 'Safety of your work' });
  await expect(popover).toContainText('“Salt Year” has no backup from the last 7 days.');
  expect(await seriousIssues(page)).toEqual([]);

  await page.keyboard.press('Escape');
  await expect(popover).toBeHidden();
  await expect(badge(page)).toBeFocused();

  await badge(page).click();
  await popover.getByRole('button', { name: 'Back up Salt Year' }).click();
  await expect(popover).toBeHidden();
  const download = page.waitForEvent('download');
  await page
    .getByRole('dialog', { name: 'Back up Salt Year' })
    .getByRole('button', { name: 'Download backup' })
    .click();
  await download;
  await page
    .getByRole('dialog', { name: 'Your backup is ready' })
    .getByRole('button', { name: 'Done' })
    .click();
  await expect(badge(page)).toHaveText('Safety: Safe');
  expect(outside).toEqual([]);
});

test('Safari outside an installed app shows At risk with a link to the install steps', async ({
  browser,
}) => {
  const safari = await browser.newContext({ userAgent: SAFARI_MAC });
  try {
    const page = await safari.newPage();
    await skipOnboarding(page);
    await newNovel(page);
    await expect(badge(page)).toHaveText('Safety: At risk');
    await badge(page).click();
    const popover = page.getByRole('dialog', { name: 'Safety of your work' });
    await expect(popover).toContainText('Safari can clear Vlo data after 7 days without a visit.');
    await popover.getByRole('link', { name: 'See the install steps' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Settings' })).toBeVisible();
    await expect(popover).toBeHidden();
    await expect(page.getByRole('region', { name: 'Install Vlo to keep your work' })).toBeVisible();
  } finally {
    await safari.close();
  }
});
