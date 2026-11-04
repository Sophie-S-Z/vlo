import { expect, test, type Page } from '@playwright/test';
import { seriousIssues } from './support/axe';
import { skipOnboarding } from './support/onboarding';
import { useTool } from './support/tools';

/* Task A7: fonts. Each writing font loads the first time the writer picks it, and picks survive a reload. */

const scene = (page: Page) => page.getByRole('textbox', { name: 'Scene 1' });
const panel = (page: Page) => page.getByRole('dialog', { name: 'Font' });

async function newNovel(page: Page) {
  await skipOnboarding(page);
  await page.getByRole('button', { name: 'New project' }).click();
  await page
    .getByRole('dialog', { name: 'New project' })
    .getByRole('button', { name: 'Create project' })
    .click();
  await expect(scene(page)).toBeFocused();
}

/** The writing-font files the page asked for, by file name. */
function watchFonts(page: Page): string[] {
  const files: string[] = [];
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.pathname.startsWith('/assets/fonts/')) files.push(url.pathname.split('/').pop() ?? '');
  });
  return files;
}

const family = (page: Page, selector: string) =>
  scene(page)
    .locator(selector)
    .first()
    .evaluate((el) => getComputedStyle(el).fontFamily);

test('a font loads only when the writer picks it, and the pick survives a reload', async ({ page }) => {
  const fonts = watchFonts(page);
  await newNovel(page);
  await page.keyboard.type('The lamp burned low.');
  await page.keyboard.press('ControlOrMeta+a');

  await useTool(page, 'Font');
  await expect(panel(page)).toBeVisible();
  await expect(panel(page).getByRole('radio', { name: 'Selected text' })).toBeChecked();
  // The menu lists 20 fonts by name, and none of their files loads until one is chosen.
  await expect(panel(page).getByRole('radiogroup', { name: 'Fonts' }).getByRole('radio')).toHaveCount(21);
  expect(fonts.filter((f) => f.startsWith('lora-'))).toEqual([]);

  await panel(page).getByRole('radio', { name: 'Lora' }).click();
  await expect(panel(page).getByRole('radio', { name: 'Lora' })).toBeChecked();
  await expect.poll(() => fonts.some((f) => f.startsWith('lora-latin-wght-normal'))).toBe(true);
  // A font the writer never looked at stays unloaded.
  expect(fonts.some((f) => f.startsWith('caveat-'))).toBe(false);
  expect(await family(page, '[data-font="lora"]')).toContain('Lora Variable');

  await page.keyboard.press('Escape');
  await expect(panel(page)).toBeHidden();
  await expect(page.getByRole('status').filter({ hasText: /Saved/ })).toHaveText('Saved');
  await page.reload();
  await expect(scene(page).locator('[data-font="lora"]')).toHaveText('The lamp burned low.');
  expect(await family(page, '[data-font="lora"]')).toContain('Lora Variable');
});

test('the whole project takes a font, and a typed font that the device lacks asks first', async ({
  page,
}) => {
  await newNovel(page);
  await page.keyboard.type('Snow on the ridge.');

  // With no selected text, the menu starts on the whole project.
  await useTool(page, 'Font');
  await expect(panel(page).getByRole('radio', { name: 'Whole project' })).toBeChecked();
  await panel(page).getByRole('searchbox', { name: 'Find a font' }).fill('lite');
  await expect(panel(page).getByRole('radiogroup', { name: 'Fonts' }).getByRole('radio')).toHaveCount(1);
  await panel(page).getByRole('radio', { name: 'Literata' }).click();
  await expect(panel(page).getByRole('status')).toHaveText('The whole project now uses Literata.');
  const manuscriptFont = () => scene(page).evaluate((el) => getComputedStyle(el).fontFamily);
  await expect.poll(manuscriptFont).toContain('Literata Variable');
  await page.keyboard.press('Escape');

  await page.reload();
  await expect.poll(manuscriptFont).toContain('Literata Variable');

  // A font name the device does not have shows a warning before Vlo uses it.
  await scene(page).click();
  await page.keyboard.press('End');
  await page.keyboard.press('Shift+Home');
  await useTool(page, 'Font');
  await expect(panel(page).getByRole('radio', { name: 'Selected text' })).toBeChecked();
  const typed = panel(page).getByRole('textbox', { name: 'Type a font name' });
  await typed.fill('Not A Real Font 7');
  await typed.press('Enter');
  const alert = panel(page).getByRole('alert');
  await expect(alert).toContainText('Vlo cannot find a font named “Not A Real Font 7” on this device.');
  await expect(scene(page).locator('[data-font]')).toHaveCount(0);
  await alert.getByRole('button', { name: 'Use the name anyway' }).click();
  const own = scene(page).locator('[data-font="local:Not A Real Font 7"]');
  await expect(own).toHaveText('Snow on the ridge.');
  // The text falls back to the project font.
  expect(await own.evaluate((el) => getComputedStyle(el).fontFamily)).toMatch(
    /^"?Not A Real Font 7"?, "?Literata Variable"?/,
  );
  // The typed font joins the writer's own fonts on this device.
  await expect(
    panel(page).getByRole('radiogroup', { name: 'Fonts' }).getByRole('radio', { name: 'Not A Real Font 7' }),
  ).toBeChecked();
});

test('the font menu has no serious axe issues', async ({ page }) => {
  await newNovel(page);
  await page.keyboard.type('Ink and paper.');
  // The word count rolls in after the save, so axe waits for it.
  await expect(page.getByText('3 words', { exact: true })).toBeVisible();
  await page.keyboard.press('ControlOrMeta+a');
  await useTool(page, 'Font');
  await expect(panel(page)).toBeVisible();
  await panel(page).getByRole('radio', { name: 'Caveat' }).hover();
  expect(await seriousIssues(page)).toEqual([]);
});
