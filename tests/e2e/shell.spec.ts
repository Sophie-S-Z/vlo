import { expect, test } from '@playwright/test';
import { skipOnboarding } from './support/onboarding';

const ROUTES = [
  { path: '/', heading: 'Library' },
  { path: '/settings', heading: 'Settings' },
  { path: '/nope', heading: 'Page not found' },
];

// a11y.spec.ts runs axe on these routes in each theme.
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
  await page.getByRole('radio', { name: 'Sepia', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'sepia');
  // The browser bar takes the page color of the chosen theme.
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#efe3cc');
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
