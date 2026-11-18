import { expect, test, type Page } from '@playwright/test';
import { seriousIssues } from './support/axe';
import { skipOnboarding, writeWithoutAccount } from './support/onboarding';
import { editorSelection } from './support/selection';

// A signed-out visit opens on the sign-in screen; these tests write with no account.
test.beforeEach(async ({ page }) => {
  await writeWithoutAccount(page);
});

/* Phase 19, Part B: the outline, paste and case, moving blocks, and find with patterns in the project. */

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

/** Types each line as its own paragraph. A line that starts with "## " is a heading. */
async function write(page: Page, lines: readonly string[]) {
  for (const [i, line] of lines.entries()) {
    if (i > 0) await page.keyboard.press('Enter');
    await page.keyboard.type(line);
  }
}

/** The text of each top-level block. */
const blocks = (page: Page) =>
  scene(page).evaluate((element) => [...element.children].map((child) => child.textContent));

test('the outline shows in the margin of a wide window, and in a popover of a narrow one', async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, 'A phone has no margin for the outline.');
  await page.setViewportSize({ width: 1920, height: 1000 });
  await newNovel(page);
  await write(page, ['## Harbour', 'Mira rows out.', '## Storm', 'The tide turns.']);

  const button = page.getByRole('button', { name: 'Outline', exact: true });
  await expect(button).toHaveAttribute('aria-pressed', 'false');
  await button.click();
  const rail = page.getByRole('navigation', { name: 'Item outline' });
  await expect(rail.getByRole('button', { name: /^Harbour/ })).toBeVisible();
  expect(await seriousIssues(page)).toEqual([]);
  await rail.getByRole('button', { name: /^Harbour/ }).click();
  await expect(scene(page)).toBeFocused();
  await expect.poll(async () => (await editorSelection(scene(page))).from).toBeLessThan(10);

  // A narrow window has no room for the rail, so the button opens a popover.
  await page.setViewportSize({ width: 1024, height: 800 });
  await expect(rail).toBeHidden();
  await button.click();
  const popover = page.getByRole('dialog', { name: 'Outline' });
  await popover.getByRole('button', { name: /^Storm/ }).click();
  await expect(popover).toBeHidden();
  await expect(scene(page)).toBeFocused();
  await expect.poll(async () => (await editorSelection(scene(page))).from).toBeGreaterThan(20);
});

test('a paste from a web page comes in clean, and one press keeps its original look', async ({ page }) => {
  await newNovel(page);
  await scene(page).evaluate((element) => {
    const data = new DataTransfer();
    data.setData(
      'text/html',
      '<p><span style="color: rgb(200, 0, 0); font-family: Georgia">Red sails</span></p>',
    );
    data.setData('text/plain', 'Red sails');
    // Firefox leaves out the clipboardData of a new ClipboardEvent, so the test sets it.
    const paste = new ClipboardEvent('paste', { bubbles: true, cancelable: true });
    Object.defineProperty(paste, 'clipboardData', { value: data });
    element.dispatchEvent(paste);
  });
  await expect(scene(page)).toContainText('Red sails');
  await expect(scene(page).locator('span[style*="color"]')).toHaveCount(0);
  await expect(page.getByRole('status').filter({ hasText: 'Pasted with clean formatting.' })).toBeVisible();

  await page.getByRole('button', { name: 'Keep the original look' }).click();
  await expect(scene(page).locator('span[style*="color"]')).toHaveText('Red sails');
  await expect(page.getByRole('button', { name: 'Keep the original look' })).toBeHidden();
});

test('Shift-F3 takes the word at the caret to the next case that changes it', async ({ page }) => {
  await newNovel(page);
  await write(page, ['the harbour']);
  await page.keyboard.press('Shift+F3');
  await expect(scene(page)).toHaveText('the Harbour');
  await page.keyboard.press('Shift+F3');
  await expect(scene(page)).toHaveText('the HARBOUR');
  await page.keyboard.press('Shift+F3');
  await expect(scene(page)).toHaveText('the harbour');
});

test('Alt-Shift-Up and the block handle move paragraphs', async ({ page, isMobile }) => {
  await newNovel(page);
  await write(page, ['One', 'Two', 'Three']);
  await page.keyboard.press('Alt+Shift+ArrowUp');
  await expect.poll(() => blocks(page)).toEqual(['One', 'Three', 'Two']);

  // A touch screen has no pointer to show the handle.
  test.skip(isMobile, 'The block handle needs a pointer.');
  await scene(page).getByText('One', { exact: true }).hover();
  const handle = page.getByRole('button', { name: 'Drag to move, or press for the block menu' });
  await expect(handle).toBeVisible();
  await handle.click();
  await expect(page.getByRole('menu')).toBeVisible();
  expect(await seriousIssues(page)).toEqual([]);
  await page.getByRole('menuitem', { name: 'Move down' }).click();
  await expect.poll(() => blocks(page)).toEqual(['Three', 'One', 'Two']);
  await expect(scene(page)).toBeFocused();
});

test('find takes a pattern, gives its error, and finds in the whole project', async ({ page }) => {
  await newNovel(page);
  await write(page, ['Mira rows to the harbour.', 'The harbor waits.']);
  await page.keyboard.press('ControlOrMeta+f');
  const bar = page.getByRole('search', { name: 'Find and replace' });
  const find = bar.getByRole('textbox', { name: 'Find' });
  await bar.getByRole('button', { name: 'Use a pattern' }).click();
  await find.fill('harb(ou');
  await expect(bar.getByRole('alert')).toContainText('This pattern has an error');
  await find.fill('harb(o)u?r');
  await expect(bar.getByRole('alert')).toHaveText('');
  await expect(bar.getByRole('status').first()).toHaveText('1 of 2');

  await bar.getByRole('button', { name: 'Whole project' }).click();
  const list = bar.getByRole('list', { name: 'Matches in the project' });
  await expect(list.getByRole('button', { name: /Scene 1/ })).toBeVisible();
  await expect(bar.getByText('2 matches in 1 item')).toBeVisible();
  expect(await seriousIssues(page)).toEqual([]);
});
