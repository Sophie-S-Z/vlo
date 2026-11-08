import { expect, test, type Locator, type Page } from '@playwright/test';
import { seriousIssues } from './support/axe';
import { skipOnboarding } from './support/onboarding';
import { useTool } from './support/tools';

/* Task A5: footnotes. Numbers follow document order in every tab, and notes survive a reload. */

const mod = process.platform === 'darwin' ? 'Meta' : 'Control';
const scene = (page: Page) => page.getByRole('textbox', { name: 'Scene 1' });
const poem = (page: Page) => page.getByRole('textbox', { name: 'Poem 1' });
const notes = (page: Page) => page.getByRole('region', { name: 'Notes' });
const panel = (page: Page) => page.getByRole('dialog', { name: 'Footnote' });

async function newProject(page: Page, kind: 'novel' | 'poetry') {
  await skipOnboarding(page);
  await page.getByRole('button', { name: 'New project' }).click();
  const dialog = page.getByRole('dialog', { name: 'New project' });
  if (kind === 'poetry') await dialog.getByRole('checkbox', { name: /Poetry collection/ }).click();
  await dialog.getByRole('button', { name: 'Create project' }).click();
  await expect(kind === 'poetry' ? poem(page) : scene(page)).toBeFocused();
}

/** Puts the caret just after `word`, the way a click there does. */
async function caretAfter(page: Page, editor: Locator, word: string) {
  await editor.evaluate((root, w) => {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const at = node.textContent?.indexOf(w) ?? -1;
      if (at < 0) continue;
      const range = document.createRange();
      range.setStart(node, at + w.length);
      range.collapse(true);
      getSelection()?.removeAllRanges();
      getSelection()?.addRange(range);
      return;
    }
    throw new Error(`No "${w}" in the text.`);
  }, word);
  // The editor reads the new selection on selectionchange.
  await page.waitForTimeout(30);
}

/** The numbers drawn on the references, in text order. */
const drawn = (editor: Locator) =>
  editor.locator('sup[data-footnote]').evaluateAll((els) => els.map((el) => el.getAttribute('data-n')));

/** The text of an editor line without the hidden "Footnote" words of its references. */
const lineText = (line: Locator) =>
  line.evaluate((el) => {
    const copy = el.cloneNode(true) as HTMLElement;
    for (const ref of copy.querySelectorAll('sup[data-footnote]')) ref.remove();
    return copy.textContent;
  });

test('footnotes from the toolbar and Mod-Alt-F number in text order, edit from the list and survive a reload', async ({
  page,
}) => {
  await newProject(page, 'novel');
  await page.keyboard.type('The harbour lights came on one by one.');

  // The toolbar inserts a reference at the caret and opens its note.
  await useTool(page, 'Footnote');
  await expect(panel(page)).toBeVisible();
  await expect(panel(page).getByRole('textbox', { name: 'Footnote 1' })).toBeFocused();
  await page.keyboard.type('Lit in 1904.');
  await page.keyboard.press('Enter');
  await expect(scene(page)).toBeFocused();
  // The caret is after the reference, so typing does not replace it.
  await page.keyboard.type(' Then dark.');
  await expect.poll(() => drawn(scene(page))).toEqual(['1']);
  await expect
    .poll(() => lineText(scene(page).locator('p').first()))
    .toBe('The harbour lights came on one by one. Then dark.');
  await expect(notes(page).getByRole('button')).toHaveText(['Edit footnote 1: Lit in 1904.']);

  // A second footnote earlier in the text becomes number 1.
  await caretAfter(page, scene(page), 'harbour');
  await page.keyboard.press(`${mod}+Alt+f`);
  await expect(panel(page).getByRole('heading', { name: 'Footnote 1' })).toBeVisible();
  await page.keyboard.press(`${mod}+i`);
  await page.keyboard.type('The old one.');
  await page.keyboard.press('Escape');
  await expect(scene(page)).toBeFocused();
  await expect.poll(() => drawn(scene(page))).toEqual(['1', '2']);
  await expect(notes(page).getByRole('button')).toHaveText([
    'Edit footnote 1: The old one.',
    'Edit footnote 2: Lit in 1904.',
  ]);
  await expect(notes(page).locator('em')).toHaveText('The old one.');

  await expect(page.getByRole('status').filter({ hasText: /Saved/ })).toHaveText('Saved');
  await page.reload();
  await expect.poll(() => drawn(scene(page))).toEqual(['1', '2']);
  await expect(scene(page).locator('sup[data-footnote]').first()).toHaveAttribute(
    'title',
    'Footnote 1: The old one.',
  );

  // A note in the list opens for editing.
  await notes(page).getByRole('button', { name: 'Edit footnote 2: Lit in 1904.' }).click();
  const note = panel(page).getByRole('textbox', { name: 'Footnote 2' });
  await expect(note).toBeFocused();
  await expect(note).toHaveText('Lit in 1904.');
  await page.keyboard.press('Backspace');
  await page.keyboard.press('Backspace');
  await page.keyboard.type('5.');
  await panel(page).getByRole('button', { name: 'Done' }).click();
  await expect(notes(page).getByRole('button').nth(1)).toHaveText('Edit footnote 2: Lit in 1905.');

  // A click on a reference opens it; Remove footnote takes it away and the other one becomes 1.
  await scene(page).locator('sup[data-footnote]').first().click();
  await expect(panel(page).getByRole('heading', { name: 'Footnote 1' })).toBeVisible();
  await panel(page).getByRole('button', { name: 'Remove footnote' }).click();
  await expect(scene(page)).toBeFocused();
  await expect.poll(() => drawn(scene(page))).toEqual(['1']);
  await expect(notes(page).getByRole('button')).toHaveText(['Edit footnote 1: Lit in 1905.']);
});

test('a footnote from the / menu in a poem line keeps every space', async ({ page }) => {
  await newProject(page, 'poetry');
  await page.keyboard.type('  salt   ');
  await page.keyboard.type('/foot');
  await expect(page.getByRole('option', { name: 'Footnote' })).toBeVisible();
  await page.keyboard.press('Enter');
  await expect(panel(page)).toBeVisible();
  await page.keyboard.type('From the shore.');
  await page.keyboard.press('Enter');
  await expect(poem(page)).toBeFocused();
  await page.keyboard.type('on  the sill');
  const line = poem(page).locator('[data-poem-line]').first();
  await expect.poll(() => lineText(line)).toBe('  salt   on  the sill');
  await expect(notes(page).getByRole('button')).toHaveText(['Edit footnote 1: From the shore.']);
  await expect(page.getByRole('status').filter({ hasText: /Saved/ })).toHaveText('Saved');
  await expect(page.getByText('4 words', { exact: true })).toBeVisible();
});

test('a footnote added in one tab renumbers the references in the other tab', async ({ page, context }) => {
  await newProject(page, 'novel');
  await page.keyboard.type('Tide and salt.');
  await page.keyboard.press(`${mod}+Alt+f`);
  await page.keyboard.type('Salt note.');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('status').filter({ hasText: /Saved/ })).toHaveText('Saved');

  const other = await context.newPage();
  await other.goto(page.url());
  await expect(notes(other).getByRole('button')).toHaveText(['Edit footnote 1: Salt note.']);

  await caretAfter(page, scene(page), 'Tide');
  await page.keyboard.press(`${mod}+Alt+f`);
  await page.keyboard.type('Tide note.');
  await page.keyboard.press('Enter');
  await expect.poll(() => drawn(scene(other))).toEqual(['1', '2']);
  await expect(notes(other).getByRole('button')).toHaveText([
    'Edit footnote 1: Tide note.',
    'Edit footnote 2: Salt note.',
  ]);
});

test('the note panel and the notes list have no serious axe issues', async ({ page }) => {
  await newProject(page, 'novel');
  await page.keyboard.type('The harbour lights came on.');
  await page.keyboard.press(`${mod}+Alt+f`);
  await page.keyboard.type('A note.');
  await expect(page.getByRole('status').filter({ hasText: /Saved/ })).toHaveText('Saved');
  expect(await seriousIssues(page)).toEqual([]);
  await page.keyboard.press('Enter');
  await expect(notes(page)).toBeVisible();
  expect(await seriousIssues(page)).toEqual([]);
});

test('the command menu inserts a footnote and opens its note', async ({ page }) => {
  await newProject(page, 'novel');
  await page.keyboard.type('Gulls over the pier.');
  await page.keyboard.press(`${mod}+k`);
  const menu = page.getByRole('dialog', { name: 'Command menu' });
  await menu.getByRole('combobox').fill('footnote');
  await menu.getByRole('option', { name: /^Footnote/ }).click();
  await expect(menu).toBeHidden();
  await expect(panel(page).getByRole('textbox', { name: 'Footnote 1' })).toBeFocused();
  await page.keyboard.type('Herring gulls.');
  await page.keyboard.press('Enter');
  await expect(scene(page)).toBeFocused();
  await expect(notes(page).getByRole('button')).toHaveText(['Edit footnote 1: Herring gulls.']);
});
