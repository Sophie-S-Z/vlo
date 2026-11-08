import { expect, test, type Page } from '@playwright/test';
import { skipOnboarding } from './support/onboarding';

const editor = (page: Page) => page.getByRole('textbox', { name: 'Poem 1' });

async function newPoetry(page: Page) {
  await skipOnboarding(page);
  await page.getByRole('button', { name: 'New project' }).click();
  const dialog = page.getByRole('dialog', { name: 'New project' });
  await dialog.getByRole('checkbox', { name: /Poetry collection/ }).click();
  await dialog.getByRole('button', { name: 'Create project' }).click();
  await expect(editor(page)).toBeFocused();
}

test('US02: text typed and left for 1.1 s is there in a new page, offline', async ({
  page,
  context,
  browserName,
}) => {
  test.skip(browserName === 'webkit', 'Playwright WebKit cannot load pages offline (see pwa.spec.ts).');
  await newPoetry(page);
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  const url = page.url();
  const text = 'Salt on the sill.';
  await page.keyboard.type(text);
  await page.keyboard.press('Enter');
  await page.keyboard.type('    The tide goes out');
  await page.waitForTimeout(1_100);
  await page.close();

  await context.setOffline(true);
  const next = await context.newPage();
  await next.goto(url);
  await expect(editor(next)).toContainText(text);
  const lines = await editor(next).locator('[data-poem-line]').allTextContents();
  expect(lines).toEqual(['Salt on the sill.', '    The tide goes out']);
  await context.setOffline(false);
});

test('the save check mark says Saved after the pause, and the word count updates', async ({ page }) => {
  await newPoetry(page);
  await page.keyboard.type('One two three');
  const status = page.getByRole('status').filter({ hasText: /Saved|could not save/ });
  await expect(status).toHaveText('Saved');
  await expect(page.getByText('3 words', { exact: true })).toBeVisible();
  await expect(page.getByText('· 1 line')).toBeVisible();
  await page.goto('/');
  await expect(page.getByRole('list', { name: 'Projects' }).getByText('3 words')).toBeVisible();
});

test('two tabs on one item: typing in one shows in the other, with a notice', async ({ page, context }) => {
  await newPoetry(page);
  const url = page.url();
  const other = await context.newPage();
  await other.goto(url);
  await expect(editor(other)).toBeVisible();
  await expect(other.getByText('This item is open in another tab. Changes show in both tabs.')).toBeVisible();
  await expect(page.getByText('This item is open in another tab. Changes show in both tabs.')).toBeVisible();

  await editor(page).click();
  await page.keyboard.type('From the first tab');
  await expect(editor(other)).toContainText('From the first tab');
  await page.waitForTimeout(800);
  await other.reload();
  await expect(editor(other)).toContainText('From the first tab');
});

test('the item editor has the poem help text and Escape then Tab leaves it', async ({ page }) => {
  await newPoetry(page);
  await expect(page.getByText(/Press Escape, then Tab, to leave the poem\./)).toBeVisible();
  await page.keyboard.type('Salt');
  await page.keyboard.press('Escape');
  await page.keyboard.press('Tab');
  await expect(editor(page)).not.toBeFocused();
  await expect(editor(page)).toHaveText('Salt');
});
