import { expect, test, type Page } from '@playwright/test';
import { seriousIssues } from './support/axe';
import { skipOnboarding, writeWithoutAccount } from './support/onboarding';
import { editorSelection } from './support/selection';
import { useTool } from './support/tools';

// A signed-out visit opens on the sign-in screen; these tests write with no account.
test.beforeEach(async ({ page }) => {
  await writeWithoutAccount(page);
});

/*
 * Plan Task H3 (roadmap F43): comments on the words of the text. Phase 19, Tasks C1 and C2: threads with
 * replies in the margin, resolve and reopen, links, and change cards.
 */

const scene = (page: Page) => page.getByRole('textbox', { name: 'Scene 1' });
const panel = (page: Page) => page.getByRole('dialog', { name: 'Comment' });
const margin = (page: Page) => page.getByRole('complementary', { name: 'Comments and changes' });
const card = (page: Page, words: string) => page.getByRole('article', { name: `Comment on “${words}”` });

async function newNovel(page: Page, text: string) {
  await skipOnboarding(page);
  await page.getByRole('button', { name: 'New project' }).click();
  await page
    .getByRole('dialog', { name: 'New project' })
    .getByRole('button', { name: 'Create project' })
    .click();
  await expect(scene(page)).toBeFocused();
  await page.keyboard.type(text);
}

/** Selects the line at the caret and puts a comment on it with the Comment tool. */
async function commentOnLine(page: Page, text: string) {
  await page.keyboard.press('Shift+Home');
  await useTool(page, 'Comment');
  await panel(page).getByRole('textbox', { name: 'Comment' }).fill(text);
  await panel(page).getByRole('button', { name: 'Save' }).click();
  await expect(panel(page)).toBeHidden();
  await expect(scene(page)).toBeFocused();
  // The words keep their selection. A key waits until the editor holds it.
  await expect.poll(async () => (await editorSelection(scene(page))).text).not.toBe('');
}

test('a narrow page shows a count in the margin, and the thread opens in the Comment panel', async ({
  page,
}) => {
  await newNovel(page, 'Mira finds the ledger');
  await commentOnLine(page, 'Too quick?');
  await expect(scene(page).locator('.vlo-comment')).toHaveText('Mira finds the ledger');
  await expect(margin(page)).toHaveCount(0);

  await page.reload();
  await page.getByRole('button', { name: 'Open the comment on “Mira finds the ledger”' }).click();
  const thread = panel(page).getByRole('article', { name: 'Comment on “Mira finds the ledger”' });
  await expect(thread).toContainText('Too quick?');
  expect(await seriousIssues(page)).toEqual([]);

  // A reply, then an edit of the first comment.
  await thread.getByRole('textbox', { name: 'Reply' }).fill('Slow it down.');
  await thread.getByRole('button', { name: 'Reply' }).click();
  await expect(thread.getByRole('listitem')).toHaveCount(2);
  await thread.getByRole('button', { name: 'More for the comment of you' }).click();
  await page.getByRole('menuitem', { name: 'Edit' }).click();
  await thread.getByRole('textbox', { name: 'Edit the comment' }).fill('Much too quick?');
  await thread.getByRole('button', { name: 'Save' }).click();
  await expect(thread).toContainText('Much too quick?');

  // Resolve hides the thread on its words. All comments lists it, and Reopen puts it back.
  await thread.getByRole('button', { name: 'Resolve' }).click();
  await expect(panel(page)).toBeHidden();
  await expect(scene(page).locator('.vlo-comment[data-resolved]')).toHaveCount(1);
  await expect(page.getByRole('button', { name: /^Open the comment/ })).toHaveCount(0);
  await useTool(page, 'All comments');
  const all = page.getByRole('dialog', { name: 'All comments' });
  await expect(all).toContainText('No open comments in this item.');
  await all.getByRole('button', { name: 'Resolved' }).click();
  await all.getByRole('button', { name: 'Reopen' }).click();
  await expect(all).toContainText('No resolved comments in this item.');
  expect(await seriousIssues(page)).toEqual([]);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: /^Open the comment/ })).toHaveCount(1);
});

test('a wide page shows each thread as a card beside its words', async ({ page, isMobile }) => {
  test.skip(isMobile, 'A phone has no margin for cards.');
  await page.setViewportSize({ width: 1920, height: 1000 });
  await newNovel(page, 'Mira finds the ledger.');
  await commentOnLine(page, 'Too quick?');
  // The panel gives the selection back as it closes, so End repeats until the caret is at the end.
  await expect(async () => {
    await page.keyboard.press('End');
    expect(await editorSelection(scene(page))).toMatchObject({ from: 23, to: 23 });
  }).toPass();
  await page.keyboard.press('Enter');
  await page.keyboard.type('The tide turns.');
  await commentOnLine(page, 'Which tide?');

  const first = card(page, 'Mira finds the ledger.');
  const second = card(page, 'The tide turns.');
  await expect(margin(page).getByRole('article')).toHaveCount(2);
  // The card at the caret is open, with its reply field.
  await expect(second.getByRole('textbox', { name: 'Reply' })).toBeVisible();
  await expect(first.getByRole('textbox', { name: 'Reply' })).toHaveCount(0);
  expect(await seriousIssues(page)).toEqual([]);

  // Mod-Alt-M on a thread's words goes to the reply field of its card.
  await page.keyboard.press('ControlOrMeta+Alt+m');
  await expect(second.getByRole('textbox', { name: 'Reply' })).toBeFocused();
  await page.keyboard.type('The spring tide.');
  await page.keyboard.press('ControlOrMeta+Enter');
  await expect(second.getByRole('listitem')).toHaveCount(2);

  // A press on the other card puts the caret in its words.
  await margin(page).getByRole('button', { name: 'Go to the comment on “Mira finds the ledger.”' }).click();
  await expect(first.getByRole('textbox', { name: 'Reply' })).toBeVisible();
  await expect.poll(async () => (await editorSelection(scene(page))).text).toBe('Mira finds the ledger.');

  // The cards follow their words after an edit above them.
  const top = async () => (await second.boundingBox())?.y ?? 0;
  const before = await top();
  // The caret goes to the start of the first line.
  await scene(page).getByText('Mira finds').click();
  await page.keyboard.press('Home');
  await expect.poll(async () => editorSelection(scene(page))).toMatchObject({ from: 1, to: 1 });
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');
  await expect.poll(top).toBeGreaterThan(before + 20);
  await expect(scene(page)).toContainText('Mira finds the ledger.');

  // Delete the thread, then Undo brings it back.
  await margin(page).getByRole('button', { name: 'Go to the comment on “The tide turns.”' }).click();
  await second.getByRole('button', { name: 'More for the comment of you' }).click();
  await page.getByRole('menuitem', { name: 'Delete thread' }).click();
  await expect(margin(page).getByRole('article')).toHaveCount(1);
  await expect(scene(page)).toContainText('Mira finds the ledger.');
  await page.keyboard.press('ControlOrMeta+z');
  await expect(margin(page).getByRole('article')).toHaveCount(2);
});

test('Copy link gives a link that opens the item at the thread', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'Only Chromium lets a test read the clipboard.');
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  await newNovel(page, 'Mira finds the ledger');
  await commentOnLine(page, 'Too quick?');
  await page.getByRole('button', { name: 'Open the comment on “Mira finds the ledger”' }).click();
  await panel(page)
    .getByRole('button', { name: 'Copy a link to the comment on “Mira finds the ledger”' })
    .click();
  const link = await page.evaluate(() => navigator.clipboard.readText());
  expect(link).toMatch(/\/p\/[^?]+\?item=[^&]+&comment=/);

  await page.goto('/library');
  await page.goto(link);
  await expect(
    panel(page).getByRole('article', { name: 'Comment on “Mira finds the ledger”' }),
  ).toContainText('Too quick?');
  await expect(page).not.toHaveURL(/comment=/);
});

test('in Suggesting, each change is a card with Accept and Reject, and Accept all takes the rest', async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, 'A phone has no margin for cards.');
  await page.setViewportSize({ width: 1920, height: 1000 });
  await newNovel(page, 'Mira finds the ledger.');
  await useTool(page, 'Track changes');
  await scene(page).click();
  await page.keyboard.press('ControlOrMeta+End');
  await page.keyboard.type(' She runs.');
  await page.keyboard.press('Enter');
  await page.keyboard.type('It is cold.');
  const cards = margin(page).getByRole('article');
  await expect(cards).toHaveCount(2);
  // The list under the text keeps its tools, and the cards hold the changes.
  await expect(page.getByRole('region', { name: 'Track changes is on' }).getByRole('listitem')).toHaveCount(
    0,
  );
  expect(await seriousIssues(page)).toEqual([]);

  await cards
    .first()
    .getByRole('button', { name: /^Reject: Inserted/ })
    .click();
  await expect(cards).toHaveCount(1);
  await expect(scene(page)).not.toContainText('She runs.');
  await useTool(page, 'Accept all changes');
  await expect(cards).toHaveCount(0);
  await expect(scene(page)).toContainText('It is cold.');
  await expect(scene(page).locator('.vlo-change')).toHaveCount(0);
});
