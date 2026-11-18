import { expect, test, type Page } from '@playwright/test';
import { seriousIssues } from './support/axe';
import { skipOnboarding, writeWithoutAccount } from './support/onboarding';

// A signed-out visit opens on the sign-in screen; these tests write with no account.
test.beforeEach(async ({ page }) => {
  await writeWithoutAccount(page);
});

/* Phase 19, Task F3: page setup. */

const scene = (page: Page) => page.getByRole('textbox', { name: 'Scene 1' });
const sheet = (page: Page) => page.locator('[data-vlo-sheet]');
const firstEnd = (page: Page) => page.locator('[data-page-end="1"]');

const PARAGRAPH =
  'The rain kept time on the glass while she wrote, and the house settled around her like a held breath. ';

/** The left padding of the sheet in units of the text size: 6 is 1 inch, as 12 point text is 1/6 inch. */
const leftMargin = (page: Page) =>
  sheet(page).evaluate((el) => {
    const text = el.querySelector('.vlo-manuscript');
    const size = text ? parseFloat(getComputedStyle(text).fontSize) : 1;
    return parseFloat(getComputedStyle(el).paddingLeft) / size;
  });

/** The top of the first page-end line, once the lines are back after a change. */
async function firstEndTop(page: Page): Promise<number> {
  await expect(page.locator('.vlo-page-lines')).not.toHaveAttribute('data-stale', { timeout: 3000 });
  return firstEnd(page).evaluate((el) => parseFloat((el as HTMLElement).style.top));
}

test('the Page popover sets the margins, page numbers and page lines of the sheet', async ({
  page,
  isMobile,
}) => {
  // A phone is too narrow for the sheet, so the page view shows no margins there.
  test.skip(isMobile, 'The sheet needs a wide window.');
  await skipOnboarding(page);
  await page.getByRole('button', { name: 'New project' }).click();
  await page
    .getByRole('dialog', { name: 'New project' })
    .getByRole('button', { name: 'Create project' })
    .click();
  await expect(scene(page)).toBeFocused();
  for (let i = 0; i < 12; i++) {
    await page.keyboard.insertText(PARAGRAPH.repeat(5));
    await page.keyboard.press('Enter');
  }

  await page.getByRole('button', { name: /^Page:/ }).click();
  const control = page.getByRole('dialog', { name: 'Page' });
  await control.getByRole('radio', { name: /^Letter/ }).click();
  await expect(sheet(page)).toBeVisible();
  expect(await leftMargin(page)).toBeCloseTo(6, 1);
  const normalEnd = await firstEndTop(page);
  // By default the number of each page sits above the line at its foot.
  await expect(firstEnd(page)).toHaveText('1');

  // Narrow margins put more text on each page, so the first page ends lower in the text.
  await control.getByLabel('Margins').selectOption('narrow');
  await expect(control.getByText('0.5 inch (13 mm) on each side.')).toBeVisible();
  await expect.poll(() => leftMargin(page)).toBeCloseTo(3, 1);
  await expect.poll(() => firstEndTop(page)).toBeGreaterThan(normalEnd);

  // Numbers at the top right: the line shows the number of the next page, and the first page has its own.
  await control.getByLabel('Page numbers').selectOption('top-right');
  await expect(firstEnd(page)).toHaveText('2');
  await control.getByLabel('Header line').selectOption('item');
  await control.getByLabel('Footer line').selectOption('own');
  await control.getByRole('textbox', { name: 'Footer line text' }).fill('Draft two');
  await page.keyboard.press('Enter');
  await expect(page.locator('[data-page-line="top"] .truncate')).toHaveText('Scene 1');
  await expect(page.locator('[data-page-line="top"] .vlo-page-line-number')).toHaveText('1');
  await expect(page.locator('[data-page-line="bottom"]')).toHaveText('Draft two');

  // Custom margins in millimeters.
  await control.getByLabel('Margins').selectOption('custom');
  await control.getByLabel('Unit').selectOption('mm');
  await expect(control.getByLabel('Left (mm)')).toHaveValue('13');
  await control.getByLabel('Left (mm)').fill('50.8');
  await page.keyboard.press('Enter');
  await expect.poll(() => leftMargin(page)).toBeCloseTo(12, 1);
  expect(await seriousIssues(page)).toEqual([]);

  // The page setup belongs to the project, so it stays after a reload.
  await page.keyboard.press('Escape');
  await expect(page.getByRole('status').filter({ hasText: /Saved/ })).toHaveText('Saved');
  await page.reload();
  await expect(sheet(page)).toBeVisible();
  expect(await leftMargin(page)).toBeCloseTo(12, 1);
  await expect(page.locator('[data-page-line="bottom"]')).toHaveText('Draft two');
});
