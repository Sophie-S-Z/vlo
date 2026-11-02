import { expect, test, type Page } from '@playwright/test';
import { seriousIssues } from './support/axe';
import { skipOnboarding } from './support/onboarding';

const ROUTES = [
  { path: '/', heading: 'Library' },
  { path: '/settings', heading: 'Settings' },
  { path: '/nope', heading: 'Page not found' },
];
const THEMES = ['ink', 'paper', 'sepia'] as const;

async function setTheme(page: Page, theme: (typeof THEMES)[number]) {
  await page.addInitScript((t) => {
    localStorage.setItem('vlo:preferences', JSON.stringify({ theme: t, calm: false }));
  }, theme);
}

for (const { path, heading } of ROUTES) {
  for (const width of [360, 1280]) {
    test(`${path} has no horizontal scroll at ${String(width)} px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });
      if (path === '/') await skipOnboarding(page);
      await page.goto(path);
      await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible();
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow).toBeLessThanOrEqual(0);
    });
  }

  for (const theme of THEMES) {
    test(`${path} has no serious axe issues in ${theme}`, async ({ page }) => {
      await setTheme(page, theme);
      if (path === '/') await skipOnboarding(page);
      await page.goto(path);
      await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible();
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      expect(await seriousIssues(page)).toEqual([]);
    });
  }
}

test('System theme follows the color scheme with no reload', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('/settings');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'paper');
  await page.evaluate(() => {
    (window as unknown as { __marker: boolean }).__marker = true;
  });
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'ink');
  expect(await page.evaluate(() => (window as unknown as { __marker?: boolean }).__marker)).toBe(true);
});

test('a chosen theme stays when the color scheme changes', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('/settings');
  await page.getByRole('radio', { name: 'Sepia' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'sepia');
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'sepia');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'sepia');
});

test('the Calm mode switch sets data-calm', async ({ page }) => {
  await page.goto('/settings');
  await expect(page.locator('html')).toHaveAttribute('data-calm', 'false');
  await page.getByRole('switch', { name: 'Calm mode' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-calm', 'true');
});

test('the skip link moves focus to the main content', async ({ page }) => {
  await skipOnboarding(page);
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1, name: 'Library' })).toBeVisible();
  await page.keyboard.press('Tab');
  const skip = page.getByRole('link', { name: 'Skip to content' });
  await expect(skip).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('main')).toBeFocused();
});
