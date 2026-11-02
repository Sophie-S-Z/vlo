import { expect, test, type Page } from '@playwright/test';
import { seriousIssues } from './support/axe';
import { skipOnboarding } from './support/onboarding';

const editor = (page: Page) => page.getByRole('textbox', { name: 'Poem 1' });
const history = (page: Page) => page.getByRole('dialog', { name: 'History' });
const mod = process.platform === 'darwin' ? 'Meta' : 'Control';

async function newPoetry(page: Page) {
  await skipOnboarding(page);
  await page.getByRole('button', { name: 'New project' }).click();
  const dialog = page.getByRole('dialog', { name: 'New project' });
  await dialog.getByRole('radio', { name: /Poetry collection/ }).click();
  await dialog.getByRole('button', { name: 'Create project' }).click();
  await expect(editor(page)).toBeFocused();
}

/** Replaces the whole poem with `text`. */
async function rewrite(page: Page, text: string) {
  await editor(page).click();
  await page.keyboard.press(`${mod}+a`);
  await page.keyboard.type(text);
}

async function saveSnapshotNow(page: Page) {
  await page.getByRole('button', { name: 'History' }).click();
  await history(page).getByRole('button', { name: 'Save a snapshot now' }).click();
  await expect(history(page).getByRole('status')).toHaveText('Snapshot saved.');
  await page.keyboard.press('Escape');
  await expect(history(page)).toBeHidden();
}

test('US03: pick a snapshot, see the changes marked, restore it in 2 clicks, and find the text from before', async ({
  page,
}) => {
  await newPoetry(page);
  await page.keyboard.type('The tide goes out');
  await saveSnapshotNow(page);
  await rewrite(page, 'The sea comes in');
  await saveSnapshotNow(page);
  await rewrite(page, 'The sea comes in at night');

  await page.getByRole('button', { name: 'History' }).click();
  const snapshots = history(page).getByRole('radio', { name: /^Saved by you/ });
  await expect(snapshots).toHaveCount(2);

  // Click 1: the older snapshot.
  await snapshots.nth(1).check();
  await expect(history(page).getByRole('deletion').filter({ hasText: 'tide' })).toBeVisible();
  await expect(history(page).getByRole('insertion').filter({ hasText: 'sea' })).toBeVisible();
  // Click 2: restore.
  await history(page).getByRole('button', { name: 'Restore this snapshot' }).click();

  await expect(history(page)).toBeHidden();
  await expect(editor(page)).toHaveText('The tide goes out');
  await expect(page.getByRole('status').filter({ hasText: 'Restored the snapshot' })).toBeVisible();

  await page.getByRole('button', { name: 'History' }).click();
  const before = history(page).getByRole('radio', { name: /^Before restore/ });
  await expect(before).toHaveCount(1);
  await before.check();
  await expect(history(page).getByRole('deletion').filter({ hasText: 'night' })).toBeVisible();
});

test('restoring right after typing keeps the last typed word in the Before restore snapshot', async ({
  page,
}) => {
  await newPoetry(page);
  await page.keyboard.type('Salt');
  await saveSnapshotNow(page);
  await editor(page).click();
  await page.keyboard.press('End');
  await page.keyboard.type(' and kettle');
  // No pause: open History and restore at once.
  await page.getByRole('button', { name: 'History' }).click();
  await history(page)
    .getByRole('radio', { name: /^Saved by you/ })
    .check();
  await history(page).getByRole('button', { name: 'Restore this snapshot' }).click();
  await expect(editor(page)).toHaveText('Salt');

  await page.getByRole('button', { name: 'History' }).click();
  await history(page)
    .getByRole('radio', { name: /^Before restore/ })
    .check();
  await expect(history(page).getByRole('deletion').filter({ hasText: 'kettle' })).toBeVisible();
});

test('the history panel has no serious axe issues', async ({ page }) => {
  await newPoetry(page);
  await page.keyboard.type('The tide goes out');
  await saveSnapshotNow(page);
  await rewrite(page, 'The sea comes in');
  await page.getByRole('button', { name: 'History' }).click();
  await history(page)
    .getByRole('radio', { name: /^Saved by you/ })
    .check();
  expect(await seriousIssues(page)).toEqual([]);
});
