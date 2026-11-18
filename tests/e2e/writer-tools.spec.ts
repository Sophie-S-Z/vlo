import { expect, test, type Page } from '@playwright/test';
import { seriousIssues } from './support/axe';
import { skipOnboarding, writeWithoutAccount } from './support/onboarding';
import { openToolMenu } from './support/tools';

// A signed-out visit opens on the sign-in screen; these tests write with no account.
test.beforeEach(async ({ page }) => {
  await writeWithoutAccount(page);
});

/* Phase 19, Task E1: the writer's toolbar and keys. */

const toolbar = (page: Page) => page.getByRole('toolbar', { name: 'Formatting', exact: true });
const scene = (page: Page) => page.getByRole('textbox', { name: 'Scene 1' });

async function newNovel(page: Page) {
  await skipOnboarding(page);
  await page.getByRole('button', { name: 'New project' }).click();
  await page
    .getByRole('dialog', { name: 'New project' })
    .getByRole('button', { name: 'Create project' })
    .click();
  await expect(scene(page)).toBeFocused();
}

/** The names of the toolbar buttons that show, in order. */
async function buttons(page: Page): Promise<string[]> {
  return toolbar(page)
    .getByRole('button')
    .filter({ visible: true })
    .evaluateAll((all) => all.map((b) => b.getAttribute('aria-label') ?? ''));
}

test('Customize toolbar pins a tool, moves it, unpins one and resets the bar', async ({ page, isMobile }) => {
  await newNovel(page);
  await (await openToolMenu(page, 'Customize toolbar')).click();
  const dialog = page.getByRole('dialog', { name: 'Customize toolbar' });
  await expect(dialog).toBeVisible();
  expect(await seriousIssues(page)).toEqual([]);

  await dialog.getByRole('switch', { name: 'Underline' }).click();
  const pinned = dialog.getByRole('list', { name: 'Tools on the toolbar' });
  await expect(pinned.getByRole('listitem').last()).toContainText('Underline');
  await dialog.getByRole('button', { name: 'Move Underline up' }).click();
  await expect(dialog.getByRole('status').filter({ hasText: 'Underline' })).toHaveText(
    'Underline is at place 6 of 7.',
  );
  await dialog.getByRole('switch', { name: 'Undo' }).click();
  await dialog.getByRole('button', { name: 'Done' }).click();
  await expect(dialog).toBeHidden();

  // The pinned tools come in the writer's order. A phone shows the first four, and the More menu lists
  // the others as quick tools.
  const bar = (await buttons(page)).filter((name) => !name.startsWith('Text style'));
  const pinnedNames = ['Redo', 'Bold', 'Italic', 'Link', 'Underline', 'Comment'];
  const start = bar.indexOf('Redo');
  expect(bar.slice(start, start + (isMobile ? 4 : 6))).toEqual(pinnedNames.slice(0, isMobile ? 4 : 6));
  await scene(page).click();
  await page.keyboard.type('Salt');
  await page.keyboard.press('ControlOrMeta+a');
  if (isMobile) {
    await toolbar(page).getByRole('button', { name: 'More tools' }).click();
    await page
      .getByRole('group', { name: 'Quick tools' })
      .getByRole('menuitemcheckbox', { name: 'Underline' })
      .click();
  } else await toolbar(page).getByRole('button', { name: 'Underline' }).click();
  await expect(scene(page).locator('u')).toBeAttached();

  // The setting stays after a reload, and Reset puts Vlo's own tools back.
  await page.reload();
  await expect(toolbar(page).getByRole('button', { name: 'Undo' })).toHaveCount(0);
  await (await openToolMenu(page, 'Customize toolbar')).click();
  await dialog.getByRole('button', { name: 'Reset the toolbar' }).click();
  await dialog.getByRole('button', { name: 'Done' }).click();
  await expect(toolbar(page).getByRole('button', { name: 'Undo' })).toBeVisible();
  await expect(toolbar(page).getByRole('button', { name: 'Underline' })).toHaveCount(0);
});

test('Settings gives a tool a new key, warns of a clash, and the key runs the tool', async ({ page }) => {
  await newNovel(page);
  await page.goto('/settings');
  const keyboard = page.getByRole('region', { name: 'Keyboard' }).or(page.locator('#keyboard'));
  await keyboard.getByRole('button', { name: 'Change the key for Bold' }).click();
  await expect(keyboard.getByRole('button', { name: 'Press the new key for Bold' })).toBeFocused();
  await page.keyboard.press('Control+Shift+X');
  await expect(keyboard.getByRole('button', { name: 'Use Vlo’s key for Bold' })).toBeVisible();

  // Underline's key: the setting asks first, and the key moves.
  await keyboard.getByRole('button', { name: 'Change the key for Italic' }).click();
  await page.keyboard.press('Control+u');
  await expect(keyboard.getByRole('alert')).toHaveText(
    /^Underline has (Ctrl\+U|⌘U) now\. Give the key to Italic\?$/,
  );
  expect(await seriousIssues(page)).toEqual([]);
  await keyboard.getByRole('button', { name: 'Give it to Italic' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Underline has no key now.' })).toBeAttached();

  // A key that the browser uses gets a warning too, and Keep the old key changes nothing.
  await keyboard.getByRole('button', { name: 'Change the key for Strikethrough' }).click();
  await page.keyboard.press('Control+s');
  await expect(keyboard.getByRole('alert')).toContainText('Your browser uses');
  await keyboard.getByRole('button', { name: 'Keep the old key' }).click();
  await expect(keyboard.getByRole('alert')).toHaveCount(0);

  await page.goBack();
  await expect(scene(page)).toBeVisible();
  await scene(page).click();
  await page.keyboard.type('Salt');
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.press('Control+b');
  await expect(scene(page).locator('strong')).toHaveCount(0);
  await page.keyboard.press('Control+Shift+X');
  await expect(scene(page).locator('strong')).toHaveText('Salt');
  await page.keyboard.press('Control+u');
  await expect(scene(page).locator('em')).toHaveText('Salt');
  await expect(scene(page).locator('u')).toHaveCount(0);

  // The shortcut sheet shows the writer's keys.
  await page.keyboard.press('ControlOrMeta+/');
  const sheet = page.getByRole('dialog', { name: 'Keyboard shortcuts' });
  await expect(sheet.getByRole('definition').filter({ hasText: 'Ctrl+Shift+X' })).toHaveCount(1);
  await expect(sheet.getByRole('term').filter({ hasText: /^Underline$/ })).toHaveCount(0);
});
