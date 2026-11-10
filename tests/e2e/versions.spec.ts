import { expect, test, type Page } from '@playwright/test';
import { seriousIssues } from './support/axe';
import { skipOnboarding } from './support/onboarding';

/* Plan Task K2 (roadmap F55): named versions of an item, a switch, a compare and "Use this". */

const editor = (page: Page) => page.getByRole('textbox', { name: 'Scene 1' });
const history = (page: Page) => page.getByRole('dialog', { name: 'History' });
const mod = process.platform === 'darwin' ? 'Meta' : 'Control';

async function newNovel(page: Page) {
  await skipOnboarding(page);
  await page.getByRole('button', { name: 'New project' }).click();
  const dialog = page.getByRole('dialog', { name: 'New project' });
  await dialog.getByRole('checkbox', { name: /Novel/ }).click();
  await dialog.getByRole('button', { name: 'Create project' }).click();
  await expect(editor(page)).toBeFocused();
}

async function openVersions(page: Page) {
  await page.getByRole('button', { name: 'History' }).click();
  await history(page).getByRole('button', { name: 'Versions' }).click();
}

test('F55: save a version, switch, compare, use one paragraph, and the text stays after a reload', async ({
  page,
}) => {
  await newNovel(page);
  await page.keyboard.type('The sea comes in.');
  await page.keyboard.press('Enter');
  await page.keyboard.type('The gulls wake.');

  await openVersions(page);
  await history(page).getByLabel('Save the text now as a version named').fill('Morning');
  await history(page).getByRole('button', { name: 'Save' }).click();
  await expect(history(page).getByRole('list', { name: 'Other versions' })).toContainText('Morning');
  expect(await seriousIssues(page)).toEqual([]);
  await page.keyboard.press('Escape');

  await editor(page).click();
  await page.keyboard.press(`${mod}+a`);
  await page.keyboard.type('The sea goes out.');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Night falls.');

  // A switch puts "Morning" in the editor and keeps the night text as "Main".
  await openVersions(page);
  await history(page).getByRole('button', { name: 'Switch to this' }).click();
  await expect(history(page)).toBeHidden();
  await expect(editor(page)).toHaveText('The sea comes in.The gulls wake.');

  // Compare with "Main" and take only its first paragraph.
  await openVersions(page);
  await expect(history(page).getByText('In the editor: Morning')).toBeVisible();
  await history(page).getByRole('button', { name: 'Compare' }).click();
  await expect(history(page).getByText('2 paragraphs differ. 0 paragraphs are the same.')).toBeVisible();
  await history(page).getByRole('button', { name: 'Use this' }).first().click();
  await expect(history(page).getByText('1 paragraph differs. 1 paragraph is the same.')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(editor(page)).toHaveText('The sea goes out.The gulls wake.');

  await page.reload();
  await expect(editor(page)).toHaveText('The sea goes out.The gulls wake.');
  await openVersions(page);
  await expect(history(page).getByText('In the editor: Morning')).toBeVisible();
  await expect(history(page).getByRole('list', { name: 'Other versions' })).toContainText('Main');
});
