import { expect, test, type Page } from '@playwright/test';
import { seriousIssues } from './support/axe';
import { skipOnboarding, writeWithoutAccount } from './support/onboarding';
import { openToolMenu } from './support/tools';

// A signed-out visit opens on the sign-in screen; these tests write with no account.
test.beforeEach(async ({ page }) => {
  await writeWithoutAccount(page);
});

/* Phase 19, Task E2: paragraph styles with names. */

const toolbar = (page: Page) => page.getByRole('toolbar', { name: 'Formatting', exact: true });
const scene = (page: Page) => page.getByRole('textbox', { name: 'Scene 1' });

/** The left margin of a paragraph of the scene, in px. */
const margin = (page: Page, text: string) =>
  scene(page)
    .locator('p', { hasText: text })
    .evaluate((p) => Number.parseFloat(getComputedStyle(p).marginInlineStart));

async function chooseStyle(page: Page, name: string) {
  await toolbar(page)
    .getByRole('button', { name: /^Text style: / })
    .click();
  await page
    .getByRole('group', { name: 'Paragraph styles' })
    .getByRole('menuitemcheckbox', { name, exact: true })
    .click();
}

test('a style goes on paragraphs, a change of the style reaches each one, and a new style comes from a paragraph', async ({
  page,
}) => {
  await skipOnboarding(page);
  await page.getByRole('button', { name: 'New project' }).click();
  await page
    .getByRole('dialog', { name: 'New project' })
    .getByRole('button', { name: 'Create project' })
    .click();
  await expect(scene(page)).toBeFocused();
  await page.keyboard.type('Dear Ada,');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Yours, Ben');
  await page.keyboard.press('Enter');
  await page.keyboard.type('The rain stopped.');

  // Letter goes on both letter paragraphs.
  await scene(page).getByText('Dear Ada,').click();
  await chooseStyle(page, 'Letter');
  await scene(page).getByText('Yours, Ben').click();
  await chooseStyle(page, 'Letter');
  await expect(toolbar(page).getByRole('button', { name: 'Text style: Letter' })).toBeVisible();
  const body = await margin(page, 'The rain stopped.');
  const before = await margin(page, 'Dear Ada,');
  expect(before).toBeGreaterThan(body + 10);

  // A change of the style reaches each paragraph that has it.
  await (await openToolMenu(page, 'Change this style')).click();
  const dialog = page.getByRole('dialog', { name: 'Change this style' });
  await expect(dialog.getByLabel('Name')).toHaveValue('Letter');
  expect(await seriousIssues(page)).toEqual([]);
  await dialog.getByLabel('Indent (em)').fill('6');
  await dialog.getByRole('button', { name: 'Save style' }).click();
  await expect(dialog).toBeHidden();
  await expect.poll(() => margin(page, 'Dear Ada,')).toBeGreaterThan(before * 2);
  expect(await margin(page, 'Yours, Ben')).toBe(await margin(page, 'Dear Ada,'));

  // A new style from a centered paragraph keeps the alignment, and the paragraph takes the style.
  await scene(page).getByText('The rain stopped.').click();
  await (await openToolMenu(page, 'Center')).click();
  await (await openToolMenu(page, 'New style from this paragraph')).click();
  const create = page.getByRole('dialog', { name: 'New paragraph style' });
  await expect(create.getByLabel('Alignment')).toHaveValue('center');
  await create.getByRole('button', { name: 'Create style' }).click();
  await expect(create.getByRole('alert')).toHaveText('Give the style a name.');
  await create.getByLabel('Name').fill('Weather');
  await create.getByRole('button', { name: 'Create style' }).click();
  await expect(create).toBeHidden();
  await expect(toolbar(page).getByRole('button', { name: 'Text style: Weather' })).toBeVisible();
  await expect(scene(page).locator('p', { hasText: 'The rain stopped.' })).toHaveCSS('text-align', 'center');

  // The / menu lists the styles, and the styles stay after a reload.
  await page.keyboard.press('End');
  await page.keyboard.press('Enter');
  await page.keyboard.type('/epigraph');
  await page.getByRole('option', { name: /^Epigraph/ }).click();
  await page.keyboard.type('Salt keeps.');
  await expect(scene(page).locator('p', { hasText: 'Salt keeps.' })).toHaveCSS('font-style', 'italic');
  await page.reload();
  await expect(scene(page).locator('p', { hasText: 'Dear Ada,' })).toHaveAttribute('data-style', 'letter');
  await expect.poll(() => margin(page, 'Dear Ada,')).toBeGreaterThan(before * 2);
  await toolbar(page)
    .getByRole('button', { name: /^Text style: / })
    .click();
  await expect(
    page.getByRole('group', { name: 'Paragraph styles' }).getByRole('menuitemcheckbox', { name: 'Weather' }),
  ).toBeVisible();
});
