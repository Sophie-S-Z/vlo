import { expect, test, type Page } from '@playwright/test';
import { seriousIssues } from './support/axe';
import { skipOnboarding, writeWithoutAccount } from './support/onboarding';
import { useTool } from './support/tools';

// A signed-out visit opens on the sign-in screen; these tests write with no account.
test.beforeEach(async ({ page }) => {
  await writeWithoutAccount(page);
});

/*
 * Atmosphere themes and Type play. An atmosphere paints a scene behind the app, its lights stand still in
 * Calm mode, and Type play shapes the selected words and turns each effect off with a second press.
 */

/** The animation name and background of a layer of the scene. */
function layer(page: Page, selector: 'body::before' | 'body::after') {
  const [element, pseudo] = selector.split('::') as [string, string];
  return page.evaluate(
    ([el, ps]) => {
      const style = getComputedStyle(document.querySelector(el ?? 'body') ?? document.body, `::${ps ?? ''}`);
      return { animation: style.animationName, image: style.backgroundImage };
    },
    [element, pseudo],
  );
}

test('an atmosphere paints its scene, keeps its lights still in Calm mode, and has no serious axe issues', async ({
  page,
}) => {
  await page.goto('/settings');
  await page.getByRole('radio', { name: /^Deep forest/ }).click();
  const html = page.locator('html');
  await expect(html).toHaveAttribute('data-theme', 'forest');
  await expect(html).toHaveAttribute('data-tone', 'dark');
  await expect(html).toHaveAttribute('data-atmosphere', '');
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#0c1511');
  expect((await layer(page, 'body::before')).image).toContain('gradient');
  expect((await layer(page, 'body::after')).animation).toBe('vlo-twinkle');

  await page.getByRole('switch', { name: 'Calm mode' }).click();
  expect((await layer(page, 'body::after')).animation).toBe('none');
  expect(await seriousIssues(page)).toEqual([]);

  await page.reload();
  await expect(html).toHaveAttribute('data-theme', 'forest');
  await page.getByRole('radio', { name: 'Paper', exact: true }).click();
  await expect(html).not.toHaveAttribute('data-atmosphere');
  expect((await layer(page, 'body::before')).image).toBe('none');
});

test('Type play shapes the selected words, and a second press turns an effect off', async ({ page }) => {
  await skipOnboarding(page);
  await page.getByRole('button', { name: 'New project' }).click();
  await page
    .getByRole('dialog', { name: 'New project' })
    .getByRole('button', { name: 'Create project' })
    .click();
  const text = page.getByRole('textbox', { name: 'Scene 1' });
  await expect(text).toBeFocused();
  await page.keyboard.type('The hollow crown');
  await page.keyboard.press('ControlOrMeta+a');

  await useTool(page, 'Type play');
  const panel = page.getByRole('dialog', { name: 'Type play' });
  await panel.getByRole('slider', { name: 'Weight' }).fill('720');
  await panel.getByRole('slider', { name: 'Letter spacing' }).fill('0.1');
  const run = text.locator('span[data-play]');
  await expect(run).toHaveCSS('font-weight', '720');
  await expect(run).toHaveCSS('letter-spacing', /px$/);

  const echo = panel.getByRole('radio', { name: 'Echo' });
  await echo.click();
  await expect(run).toHaveClass(/vlo-play-echo/);
  await echo.click();
  await expect(echo).toHaveAttribute('aria-checked', 'false');
  await expect(run).not.toHaveClass(/vlo-play-echo/);

  await panel.getByRole('button', { name: 'Reset' }).click();
  await expect(text.locator('span[data-play]')).toHaveCount(0);
});
