import { expect, test, type Page } from '@playwright/test';
import { skipOnboarding } from './support/onboarding';
import { seedProjects } from './support/seed';

declare global {
  interface Window {
    __viewTransitions: number;
  }
}

/** Counts every view transition the page starts, React's included. */
async function countViewTransitions(page: Page) {
  await page.addInitScript(() => {
    window.__viewTransitions = 0;
    const start = document.startViewTransition.bind(document);
    document.startViewTransition = ((...args: Parameters<typeof start>) => {
      window.__viewTransitions += 1;
      return start(...args);
    }) as typeof document.startViewTransition;
  });
}

async function expectNoMotion(page: Page, step: string) {
  const state = await page.evaluate(() => ({
    animations: document.getAnimations().map((a) => (a as CSSAnimation).animationName || a.constructor.name),
    transitions: window.__viewTransitions,
  }));
  expect(state, step).toEqual({ animations: [], transitions: 0 });
}

const projects = (page: Page) => page.getByRole('list', { name: 'Projects' }).getByRole('listitem');

/** US14: the Library, a dialog, opening a project and a theme change, all with no motion at all. */
async function walkThrough(page: Page) {
  await skipOnboarding(page);
  await seedProjects(page, 6);
  await expect(projects(page)).toHaveCount(6);
  await expectNoMotion(page, 'Library');

  await page.getByRole('radio', { name: 'List' }).click();
  await expect(page.getByRole('radio', { name: 'List' })).toHaveAttribute('aria-checked', 'true');
  await expectNoMotion(page, 'grid to list');
  await page.getByRole('radio', { name: 'Grid' }).click();
  await expectNoMotion(page, 'list to grid');

  await page.getByRole('button', { name: 'New project' }).click();
  await expect(page.getByRole('dialog', { name: 'New project' })).toBeVisible();
  await expectNoMotion(page, 'New project dialog');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'New project' })).toBeHidden();

  await page.getByRole('link', { name: 'Seeded project 1' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Seeded project 1' })).toBeVisible();
  await expectNoMotion(page, 'open a project');

  await page.getByRole('link', { name: 'Settings' }).click();
  await page.getByRole('radio', { name: /^Sepia/ }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'sepia');
  await expectNoMotion(page, 'theme change');
}

test.describe('with reduced motion', () => {
  test.use({ reducedMotion: 'reduce' });

  test('US14: nothing animates and no view transition starts', async ({ page }) => {
    await countViewTransitions(page);
    await walkThrough(page);
  });
});

test('US14: Calm mode stops all motion even when the system allows it', async ({ page }) => {
  await countViewTransitions(page);
  await page.addInitScript(() => {
    localStorage.setItem('vlo:preferences', JSON.stringify({ theme: 'system', calm: true }));
  });
  await walkThrough(page);
});

test('with motion allowed, the cards rise in and morph between grid and list, and the theme spreads', async ({
  page,
  browserName,
}) => {
  test.skip(browserName !== 'chromium', 'The check counts view transitions, which this engine may not run.');
  await countViewTransitions(page);
  await skipOnboarding(page);
  await seedProjects(page, 6);
  await expect(projects(page)).toHaveCount(6);
  const rising = await page.evaluate(
    () => document.getAnimations().filter((a) => (a as CSSAnimation).animationName === 'vlo-rise').length,
  );
  expect(rising).toBeGreaterThan(0);

  await page.getByRole('radio', { name: 'List' }).click();
  await expect.poll(() => page.evaluate(() => window.__viewTransitions)).toBeGreaterThanOrEqual(1);

  const before = await page.evaluate(() => window.__viewTransitions);
  await page.getByRole('link', { name: 'Settings' }).click();
  await page.getByRole('radio', { name: /^Sepia/ }).click();
  await expect.poll(() => page.evaluate(() => window.__viewTransitions)).toBeGreaterThan(before);
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'sepia');
  // The reveal grows from the centre of the radio the writer chose.
  const box = await page.getByRole('radio', { name: /^Sepia/ }).boundingBox();
  const origin = await page.evaluate(() => ({
    x: parseFloat(document.documentElement.style.getPropertyValue('--vt-x')),
    y: parseFloat(document.documentElement.style.getPropertyValue('--vt-y')),
  }));
  expect(origin.x).toBeCloseTo((box?.x ?? 0) + (box?.width ?? 0) / 2, 0);
  expect(origin.y).toBeCloseTo((box?.y ?? 0) + (box?.height ?? 0) / 2, 0);
});

test('turning reduced motion on keeps the open editor, its text and its focus', async ({ page }) => {
  await skipOnboarding(page);
  await page.getByRole('button', { name: 'New project' }).click();
  await page
    .getByRole('dialog', { name: 'New project' })
    .getByRole('button', { name: 'Create project' })
    .click();
  const editor = page.getByRole('textbox', { name: 'Scene 1' });
  await expect(editor).toBeFocused();
  await page.keyboard.type('Rain on the ledger.');
  const before = await editor.elementHandle();

  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect
    .poll(() => page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches))
    .toBe(true);
  // The same element, still focused: the page below the view transition boundary did not remount.
  expect(await before.evaluate((element) => element.isConnected && element === document.activeElement)).toBe(
    true,
  );
  await page.keyboard.type(' Still here.');
  await expect(editor).toHaveText('Rain on the ledger. Still here.');
});
