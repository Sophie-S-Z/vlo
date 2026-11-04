import { expect, test, type Page } from '@playwright/test';
import { seriousIssues } from './support/axe';
import { skipOnboarding } from './support/onboarding';

/* Task A7: page format, page-end lines and page zoom. */

const scene = (page: Page) => page.getByRole('textbox', { name: 'Scene 1' });
const lines = (page: Page) => page.locator('.vlo-page-lines');

async function newNovel(page: Page) {
  await skipOnboarding(page);
  await page.getByRole('button', { name: 'New project' }).click();
  await page
    .getByRole('dialog', { name: 'New project' })
    .getByRole('button', { name: 'Create project' })
    .click();
  await expect(scene(page)).toBeFocused();
}

async function choosePage(page: Page, format: 'Pageless' | 'Letter' | 'A4') {
  await page.getByRole('button', { name: /^Page:/ }).click();
  const control = page.getByRole('dialog', { name: 'Page' });
  await control.getByRole('radio', { name: new RegExp(`^${format}`) }).click();
  await expect(control.getByRole('radio', { name: new RegExp(`^${format}`) })).toBeChecked();
  await page.keyboard.press('Escape');
  await expect(control).toBeHidden();
}

const PARAGRAPH =
  'The rain kept time on the glass while she wrote, and the house settled around her like a held breath. ';

test('Letter shows a sheet whose page-end lines come back after a typing pause', async ({
  page,
  isMobile,
}) => {
  await newNovel(page);
  for (let i = 0; i < 12; i++) {
    await page.keyboard.insertText(PARAGRAPH.repeat(5));
    await page.keyboard.press('Enter');
  }
  await choosePage(page, 'Letter');

  if (isMobile) {
    // A phone is too narrow for a readable sheet, so the text stays pageless and says why.
    await expect(page.getByText('This window is too narrow for the page view')).toBeVisible();
    await expect(page.locator('[data-vlo-sheet]')).toHaveCount(0);
    return;
  }

  const sheet = page.locator('[data-vlo-sheet]');
  await expect(sheet).toBeVisible();
  // The sheet keeps Letter proportions with 12 point text at any zoom: 816 px wide for 16 px text.
  const { ratio, padding } = await sheet.evaluate((el) => {
    const text = el.querySelector('.vlo-manuscript');
    const size = text ? parseFloat(getComputedStyle(text).fontSize) : 0;
    return {
      ratio: el.getBoundingClientRect().width / size,
      padding: parseFloat(getComputedStyle(el).paddingLeft) / size,
    };
  });
  expect(ratio).toBeCloseTo(51, 0);
  expect(padding).toBeCloseTo(6, 1);

  await expect(page.locator('[data-page-end]').first()).toBeAttached();
  await expect(lines(page)).not.toHaveAttribute('data-stale');
  expect(await page.locator('[data-page-end]').count()).toBeGreaterThanOrEqual(2);
  await expect(page.locator('[data-page-end="1"]')).toHaveText('1');

  // A key hides the lines at once; they come back once typing pauses.
  await scene(page).click();
  await page.keyboard.press('ControlOrMeta+End');
  await page.keyboard.type('x');
  await expect(lines(page)).toHaveAttribute('data-stale', '');
  expect(await lines(page).evaluate((el) => getComputedStyle(el).opacity)).toBe('0');
  await expect(lines(page)).not.toHaveAttribute('data-stale', { timeout: 3000 });

  // The page count shows in the page control, and the format stays after a reload.
  await page.getByRole('button', { name: /^Page: Letter/ }).click();
  await expect(page.getByRole('dialog', { name: 'Page' })).toContainText(/This item fills about \d+ pages\./);
  expect(await seriousIssues(page)).toEqual([]);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('status').filter({ hasText: /Saved/ })).toHaveText('Saved');
  await page.reload();
  await expect(page.locator('[data-vlo-sheet]')).toBeVisible();
  await expect(page.locator('[data-page-end]').first()).toBeAttached();
});

test('page zoom scales the pageless text and stays on this device', async ({ page }) => {
  await newNovel(page);
  await page.keyboard.type('Morning came slowly.');
  const size = () => scene(page).evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
  const base = await size();

  await page.getByRole('button', { name: /^Page:/ }).click();
  const control = page.getByRole('dialog', { name: 'Page' });
  await control.getByRole('button', { name: 'Zoom in' }).click();
  await control.getByRole('button', { name: 'Zoom in' }).click();
  await expect(control.getByRole('slider', { name: /Zoom/ })).toHaveValue('120');
  await expect.poll(size).toBeCloseTo(base * 1.2, 1);
  await page.keyboard.press('Escape');

  await page.reload();
  await expect(page.getByRole('button', { name: 'Page: Pageless, zoom 120 percent' })).toBeVisible();
  await expect.poll(size).toBeCloseTo(base * 1.2, 1);

  await page.getByRole('button', { name: /^Page:/ }).click();
  await page.getByRole('dialog', { name: 'Page' }).getByRole('button', { name: 'Reset' }).click();
  await expect.poll(size).toBeCloseTo(base, 1);
});
