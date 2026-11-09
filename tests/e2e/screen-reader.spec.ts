import { expect, test, type Locator, type Page } from '@playwright/test';
import { skipOnboarding } from './support/onboarding';

/*
 * The steps of docs/screen-reader-test.md (plan Task G8), with the keyboard only. Each control is found by
 * its role and name, as a screen reader finds it. `press` focuses a control and presses a key on it.
 */

async function press(target: Locator, key = 'Enter') {
  await target.focus();
  await target.press(key);
}

/** Mod-K, the words, and Enter on the option that the words select. */
async function command(page: Page, text: string, option: string) {
  await page.keyboard.press('ControlOrMeta+k');
  const menu = page.getByRole('dialog', { name: 'Command menu' });
  // The menu loads on its first open. Keys typed before its field has focus go nowhere.
  await expect(menu.getByRole('combobox')).toBeFocused();
  await page.keyboard.type(text);
  await expect(menu.getByRole('option', { name: option })).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('Enter');
}

test('the screen reader script runs with the keyboard only', async ({ page, isMobile }) => {
  test.skip(isMobile, 'The script is for a desktop screen reader. Under 600 px the binder is a drawer.');
  await skipOnboarding(page);

  // 2. Create a project.
  await press(page.getByRole('button', { name: 'New project' }));
  const create = page.getByRole('dialog', { name: 'New project' });
  await create.getByRole('textbox', { name: 'Title' }).fill('Salt Year');
  await create.getByRole('textbox', { name: 'Title' }).press('Enter');
  const scene = page.getByRole('textbox', { name: 'Scene 1' });
  await expect(scene).toBeFocused();

  // 3. Write.
  await page.keyboard.type('The harbour lights came on.');
  await expect(page.getByRole('status').filter({ hasText: /Saved/ })).toHaveText('Saved');

  // 4. Take a snapshot.
  const historyButton = page.getByRole('button', { name: 'History' });
  await press(historyButton);
  const history = page.getByRole('dialog', { name: 'History' });
  await press(history.getByRole('button', { name: 'Save a snapshot now' }));
  await expect(history.getByRole('status')).toHaveText('Snapshot saved.');
  await page.keyboard.press('Escape');
  await expect(historyButton).toBeFocused();

  // 5. Add a scene and reorder it.
  const binder = page.getByRole('navigation', { name: 'Binder' });
  await press(binder.getByRole('button', { name: 'Options for Chapter 1' }));
  await press(page.getByRole('menuitem', { name: 'Add Scene inside' }));
  await expect(page.getByRole('textbox', { name: 'Scene 2' })).toBeFocused();
  const live = binder.getByRole('status');
  await press(binder.getByRole('button', { name: 'Move Scene 2' }), 'Space');
  await expect(live.filter({ hasText: 'Picked up' })).toHaveText('Picked up Scene 2.');
  // dnd-kit starts to read the arrow keys in a timer after the pick-up. A timer set now runs after it.
  await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 0)));
  await page.keyboard.press('ArrowUp');
  await expect(live.filter({ hasText: 'is over' })).toHaveText('Scene 2 is over Scene 1.');
  await page.keyboard.press('Space');
  await expect(live.filter({ hasText: 'moved' })).toHaveText('Scene 2 moved. It is now 1 of 2 in Chapter 1.');

  // 6. Export.
  await command(page, 'Export', 'Export…');
  const exportDialog = page.getByRole('dialog', { name: 'Export' });
  const exported = page.waitForEvent('download');
  await press(exportDialog.getByRole('button', { name: 'Export', exact: true }));
  await exported;
  await expect(page.getByRole('dialog', { name: 'Your file is ready' })).toBeVisible();
  await page.keyboard.press('Escape');

  // 7. Back up.
  await command(page, 'Back up', 'Back up project…');
  const backup = page.getByRole('dialog', { name: 'Back up Salt Year' });
  const saved = page.waitForEvent('download');
  await press(backup.getByRole('button', { name: 'Download backup' }));
  await saved;
  await page.keyboard.press('Escape');

  // 8. Rename.
  await command(page, 'Library', 'Go to the Library');
  await expect(page.getByRole('heading', { level: 1, name: 'Library' })).toBeVisible();
  await press(page.getByRole('button', { name: 'Options for Salt Year' }));
  await press(page.getByRole('menuitem', { name: 'Rename' }));
  const rename = page.getByRole('dialog', { name: 'Rename project' });
  await rename.getByRole('textbox', { name: 'Title' }).fill('Salt Years');
  await rename.getByRole('textbox', { name: 'Title' }).press('Enter');
  await expect(page.getByRole('link', { name: 'Salt Years', exact: true })).toBeVisible();
});
