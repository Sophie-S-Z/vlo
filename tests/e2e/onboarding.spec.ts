import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

async function holdToOpen(page: Page) {
  const hold = page.getByRole('button', { name: 'Hold to open your first page' });
  await hold.hover();
  await page.mouse.down();
  await page.waitForTimeout(1_400);
  await page.mouse.up();
}

test('US15: a first visit reaches the first poem in four actions, with Skip on every step', async ({
  page,
}) => {
  const started = Date.now();
  await page.goto('/');
  await expect(page).toHaveURL(/\/welcome$/);
  const skip = page.getByRole('button', { name: 'Skip' });

  await expect(page.getByRole('heading', { level: 1, name: 'What do you write?' })).toBeVisible();
  await expect(skip).toBeVisible();
  await page.getByRole('radio', { name: /Poetry collection/ }).click(); // action 1
  await page.getByRole('button', { name: 'Next' }).click(); // action 2

  await expect(page.getByRole('heading', { level: 1, name: 'Your words stay yours' })).toBeVisible();
  await expect(skip).toBeVisible();
  await expect(page.getByRole('radio', { name: /Pen/ })).toBeChecked();
  await page.getByRole('button', { name: 'Next' }).click(); // action 3

  await expect(page.getByRole('heading', { level: 1, name: 'Name it' })).toBeVisible();
  await expect(skip).toBeVisible();
  await expect(page.getByLabel('Title')).toHaveValue('Untitled collection');
  await holdToOpen(page); // action 4

  await expect(page).toHaveURL(/\/p\/[0-9a-f-]{36}\?item=[0-9a-f-]{36}$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Untitled collection' })).toBeVisible();
  await expect(page.getByRole('heading', { level: 2, name: 'Poem 1' })).toBeVisible();
  expect(Date.now() - started).toBeLessThan(120_000);

  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1, name: 'Library' })).toBeVisible();
});

test('Back returns to the step before and keeps the choice', async ({ page }) => {
  await page.goto('/welcome');
  await page.getByRole('radio', { name: /Memoir/ }).click();
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByRole('button', { name: 'Back' }).click();
  await expect(page.getByRole('radio', { name: /Memoir/ })).toBeChecked();
});

test('Skip goes to the Library, and the welcome screen never comes back', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Skip' }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Library' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { level: 1, name: 'Library' })).toBeVisible();
  await expect(page).toHaveURL(/\/$/);
});

test('with Calm mode the hold becomes a plain button', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('vlo:preferences', JSON.stringify({ theme: 'system', calm: true }));
  });
  await page.goto('/welcome');
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByRole('button', { name: 'Open your first page' }).click();
  await expect(page.getByRole('heading', { level: 2, name: 'Scene 1' })).toBeVisible();
});

test('every welcome step has no serious axe issues and no horizontal scroll at 360 px', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  await page.goto('/welcome');
  for (const heading of ['What do you write?', 'Your words stay yours', 'Name it']) {
    await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible();
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
      .analyze();
    const serious = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
    expect(serious.map((v) => `${v.id}: ${v.nodes.map((n) => n.failureSummary ?? '').join(' | ')}`)).toEqual(
      [],
    );
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    if (heading !== 'Name it') await page.getByRole('button', { name: 'Next' }).click();
  }
});
