import { expect, test, type Page } from '@playwright/test';
import { seriousIssues } from './support/axe';
import { skipOnboarding } from './support/onboarding';
import { editorSelection } from './support/selection';
import { useTool } from './support/tools';

/* Plan Task I1 (roadmap F44, decision R1): Track changes and revision passes. */

const scene = (page: Page) => page.getByRole('textbox', { name: 'Scene 1' });
const changes = (page: Page) => page.getByRole('region', { name: 'Track changes is on' });
/** Waits until the editor holds the caret at `pos`, as it does once Chrome sends the caret move. */
const caretAt = (page: Page, pos: number) =>
  expect.poll(async () => (await editorSelection(scene(page))).from).toBe(pos);
/**
 * Moves the caret to the start of the text. ProseMirror puts the caret back when it goes to the start
 * less than 200 ms after the text gets focus, as a browser does on focus. A test is that fast, so it
 * presses Home again.
 */
const toStart = (page: Page) =>
  expect(async () => {
    await page.keyboard.press('Home');
    expect((await editorSelection(scene(page))).from).toBe(1);
  }).toPass();

test('tracked words survive a reload, and accept and reject settle them', async ({ page }) => {
  await skipOnboarding(page);
  await page.getByRole('button', { name: 'New project' }).click();
  await page
    .getByRole('dialog', { name: 'New project' })
    .getByRole('button', { name: 'Create project' })
    .click();
  await expect(scene(page)).toBeFocused();
  await page.keyboard.type('Mira finds the ledger.');

  await useTool(page, 'Track changes');
  await expect(changes(page)).toBeVisible();
  await scene(page).click();
  await page.keyboard.press('End');
  await page.keyboard.press('ArrowLeft');
  await caretAt(page, 22);
  await page.keyboard.type(' at last');
  await toStart(page);
  for (let i = 0; i < 5; i += 1) await page.keyboard.press('Delete');
  await expect(scene(page)).toHaveText('Mira finds the ledger at last.');
  await expect(scene(page).locator('.vlo-change[data-change="delete"]')).toHaveText('Mira ');
  await expect(scene(page).locator('.vlo-change[data-change="insert"]')).toHaveText(' at last');
  expect(await seriousIssues(page)).toEqual([]);

  await page.reload();
  await expect(changes(page).getByRole('listitem')).toHaveCount(2);
  await changes(page).getByRole('button', { name: 'Accept: Deleted “Mira”' }).click();
  await changes(page).getByRole('button', { name: 'Reject: Inserted “at last”' }).click();
  await expect(scene(page)).toHaveText('finds the ledger.');
  await expect(changes(page).getByRole('listitem')).toHaveCount(0);

  // The switch belongs to the project, so it is still on after the reload.
  await useTool(page, 'Track changes');
  await expect(page.getByRole('region', { name: 'Track changes is on' })).toBeHidden();
});

for (const theme of ['ink', 'paper', 'sepia', 'contrast'] as const) {
  test(`waiting changes and their list have no serious axe issues in ${theme}`, async ({ page }) => {
    await page.addInitScript((t) => {
      localStorage.setItem('vlo:preferences', JSON.stringify({ theme: t, calm: false }));
    }, theme);
    await skipOnboarding(page);
    await page.getByRole('button', { name: 'New project' }).click();
    await page
      .getByRole('dialog', { name: 'New project' })
      .getByRole('button', { name: 'Create project' })
      .click();
    await expect(scene(page)).toBeFocused();
    await page.keyboard.type('Mira finds the ledger.');
    await useTool(page, 'Track changes');
    await scene(page).click();
    await page.keyboard.press('End');
    await page.keyboard.type(' Then she runs.');
    await toStart(page);
    await page.keyboard.press('Delete');
    await expect(changes(page).getByRole('listitem')).toHaveCount(2);
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    expect(await seriousIssues(page)).toEqual([]);
  });
}
