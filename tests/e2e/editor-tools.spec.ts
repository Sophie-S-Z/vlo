import { expect, test, type Page } from '@playwright/test';
import { seriousIssues } from './support/axe';
import { skipOnboarding } from './support/onboarding';
import { useTool } from './support/tools';

/* Task A1 and A2: one command registry behind the toolbar, the selection menu, the / menu and Mod-K. */

const scene = (page: Page) => page.getByRole('textbox', { name: 'Scene 1' });
const toolbar = (page: Page) => page.getByRole('toolbar', { name: 'Formatting', exact: true });
const bubble = (page: Page) => page.getByRole('toolbar', { name: 'Selection formatting' });
const mod = process.platform === 'darwin' ? 'Meta' : 'Control';
const LINE = 'The harbour lights came on one by one.';

async function newNovel(page: Page) {
  await skipOnboarding(page);
  await page.getByRole('button', { name: 'New project' }).click();
  await page
    .getByRole('dialog', { name: 'New project' })
    .getByRole('button', { name: 'Create project' })
    .click();
  await expect(scene(page)).toBeFocused();
  await page.keyboard.type(LINE);
}

/** Selects one word with the DOM selection, the way a mouse drag does, and waits for the editor to see it. */
async function selectWord(page: Page, word: string) {
  await scene(page).evaluate((root, w) => {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const at = node.textContent?.indexOf(w) ?? -1;
      if (at < 0) continue;
      const range = document.createRange();
      range.setStart(node, at);
      range.setEnd(node, at + w.length);
      const selection = getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
      return;
    }
    throw new Error(`No "${w}" in the text.`);
  }, word);
  await expect(bubble(page)).toBeVisible();
}

const boldWords = (page: Page) => scene(page).locator('strong').allTextContents();

test('each surface makes the same word bold: toolbar, shortcut, selection menu, / menu and Mod-K', async ({
  page,
}) => {
  await newNovel(page);

  await selectWord(page, 'harbour');
  await toolbar(page).getByRole('button', { name: 'Bold' }).click();
  await expect.poll(() => boldWords(page)).toEqual(['harbour']);
  await expect(toolbar(page).getByRole('button', { name: 'Bold' })).toHaveAttribute('aria-pressed', 'true');

  await page.keyboard.press(`${mod}+b`);
  await expect.poll(() => boldWords(page)).toEqual([]);

  await bubble(page).getByRole('button', { name: 'Bold' }).click();
  await expect.poll(() => boldWords(page)).toEqual(['harbour']);
  await bubble(page).getByRole('button', { name: 'Bold' }).click();
  await expect.poll(() => boldWords(page)).toEqual([]);

  // The / menu sets bold for the words typed next.
  await page.keyboard.press('End');
  await page.keyboard.type(' /bol');
  await expect(
    page.getByRole('listbox', { name: 'Tools' }).getByRole('option', { name: /Bold/ }),
  ).toBeVisible();
  await page.keyboard.press('Enter');
  await page.keyboard.type('Loud');
  await expect.poll(() => boldWords(page)).toEqual(['Loud']);
  await expect(scene(page)).toContainText(`${LINE} Loud`);

  await selectWord(page, 'lights');
  await page.keyboard.press(`${mod}+k`);
  const menu = page.getByRole('dialog', { name: 'Command menu' });
  await menu.getByRole('combobox').fill('bold');
  await menu.getByRole('option', { name: /^Bold/ }).click();
  await expect(menu).toBeHidden();
  await expect.poll(() => boldWords(page)).toEqual(['lights', 'Loud']);
  await expect(scene(page)).toBeFocused();
});

test('keyboard only: Alt-F10 reaches the selection menu, Escape returns, and the / menu runs a block tool', async ({
  page,
}) => {
  await newNovel(page);
  await selectWord(page, 'lights');
  await page.keyboard.press('Alt+F10');
  await expect(bubble(page).getByRole('button', { name: 'Bold' })).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await expect(bubble(page).getByRole('button', { name: 'Italic' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(scene(page).locator('em')).toHaveText('lights');
  await page.keyboard.press('Escape');
  await expect(scene(page)).toBeFocused();

  // The end of the text, not of the line: on a phone the sentence wraps.
  await page.keyboard.press(`${mod}+End`);
  // The menu hides once the editor reads the new caret. An Enter sent before that splits the line at
  // the old selection.
  await expect(bubble(page)).toBeHidden();
  await page.keyboard.press('Enter');
  await page.keyboard.type('/quo');
  await expect(scene(page)).toHaveAttribute('aria-activedescendant', /.+/);
  await page.keyboard.press('Enter');
  await page.keyboard.type('An epigraph.');
  await expect(scene(page).locator('blockquote')).toHaveText('An epigraph.');

  // Escape closes the / menu and keeps what was typed.
  await page.keyboard.type(' /zz');
  await page.keyboard.press('Escape');
  await expect(page.getByText('No tools match.')).toBeHidden();
  await expect(scene(page).locator('blockquote')).toHaveText('An epigraph. /zz');
});

test('a palette color shows its contrast, survives a reload and follows the theme', async ({ page }) => {
  await newNovel(page);
  await selectWord(page, 'harbour');
  await bubble(page).getByRole('button', { name: 'Font color' }).click();
  const panel = page.getByRole('dialog', { name: 'Font color' });
  await panel.getByRole('radio', { name: 'Iris' }).click();
  await expect(panel.getByText(/Contrast \d+\.\d:1 on this page\./)).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(panel).toBeHidden();
  await expect(scene(page)).toBeFocused();

  const iris = scene(page).locator('span[style*="--vlo-text-iris"]');
  await expect(iris).toHaveText('harbour');
  await expect(page.getByRole('status').filter({ hasText: /Saved/ })).toHaveText('Saved');
  await page.reload();
  await expect(iris).toHaveText('harbour');
  const paper = await iris.evaluate((el) => getComputedStyle(el).color);
  await page.evaluate(() => {
    document.documentElement.dataset.theme = 'ink';
  });
  await expect.poll(() => iris.evaluate((el) => getComputedStyle(el).color)).not.toBe(paper);
});

test('a custom color below 4.5:1 shows a warning and still applies', async ({ page }) => {
  await newNovel(page);
  await selectWord(page, 'harbour');
  await bubble(page).getByRole('button', { name: 'Highlight' }).click();
  const panel = page.getByRole('dialog', { name: 'Highlight' });
  await panel.getByLabel('Color code').fill('#222222');
  await panel.getByRole('button', { name: 'Apply' }).click();
  await expect(panel.getByText(/below 4\.5:1/)).toBeVisible();
  await expect(scene(page).locator('mark[data-color="#222222"]')).toHaveText('harbour');
  await expect(panel.getByRole('button', { name: 'Recent color #222222' })).toBeVisible();
});

test('the shortcut sheet opens with Mod-/ and lists the registry shortcuts', async ({ page }) => {
  await newNovel(page);
  await page.keyboard.press(`${mod}+/`);
  const sheet = page.getByRole('dialog', { name: 'Keyboard shortcuts' });
  await expect(sheet.getByText('Strikethrough')).toBeVisible();
  await expect(sheet.getByText('Clear formatting')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(sheet).toBeHidden();
  await expect(scene(page)).toBeFocused();
});

test('focus mode hides the toolbar and keeps the selection menu', async ({ page, isMobile }) => {
  test.skip(isMobile, 'The focus button sits in the project tools, which phones show as icons.');
  await newNovel(page);
  await page.getByRole('button', { name: 'Focus', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Enter focus mode' }).click();
  await expect(toolbar(page)).toBeHidden();
  await selectWord(page, 'harbour');
  await expect(bubble(page).getByRole('button', { name: 'Italic' })).toBeVisible();
});

test('on a phone, secondary tools move into the More menu', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 800 });
  await newNovel(page);
  await expect(toolbar(page).getByRole('button', { name: 'Underline' })).toBeHidden();
  await selectWord(page, 'harbour');
  await toolbar(page).getByRole('button', { name: 'More tools' }).click();
  await page.getByRole('menuitemcheckbox', { name: /Underline/ }).click();
  await expect(scene(page).locator('u')).toHaveText('harbour');
});

test('the open tool surfaces have no serious axe issues', async ({ page }) => {
  await newNovel(page);
  // The word count rolls in after the save pause. axe reads the page after that.
  await expect(page.getByRole('status').filter({ hasText: /Saved/ })).toHaveText('Saved');
  await selectWord(page, 'harbour');
  expect(await seriousIssues(page)).toEqual([]);
  await bubble(page).getByRole('button', { name: 'Font color' }).click();
  await expect(page.getByRole('dialog', { name: 'Font color' })).toBeVisible();
  expect(await seriousIssues(page)).toEqual([]);
  await page.keyboard.press('Escape');
  await page.keyboard.press('End');
  await page.keyboard.type(' /');
  await expect(page.getByRole('listbox', { name: 'Tools' })).toBeVisible();
  expect(await seriousIssues(page)).toEqual([]);
});

test('special characters: find by name, insert with Enter, then find it under Recent', async ({ page }) => {
  await newNovel(page);
  await page.keyboard.type(' ');
  await useTool(page, 'Special characters');
  const panel = page.getByRole('dialog', { name: 'Special characters' });
  await panel.getByLabel('Find a character by name').fill('section sign');
  await page.keyboard.press('Enter');
  await expect(scene(page)).toContainText(`${LINE} §`);

  // Arrow keys move in the grid. The panel stays open for the next character.
  await panel.getByLabel('Find a character by name').fill('greek small letter');
  await page.keyboard.press('ArrowDown');
  await expect(panel.getByRole('button', { name: 'greek small letter alpha' })).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Enter');
  await expect(scene(page)).toContainText(`${LINE} §β`);

  await panel.getByLabel('Find a character by name').fill('');
  await expect(panel.getByRole('button', { name: 'Recent', pressed: true })).toBeVisible();
  await expect(panel.getByRole('group', { name: 'Recent' }).getByRole('button')).toHaveCount(2);
  await page.keyboard.press('Escape');
  await expect(scene(page)).toBeFocused();

  await page.keyboard.type(' /em da');
  await page.keyboard.press('Enter');
  await expect(scene(page)).toContainText(`${LINE} §β —`);
});

test('smart punctuation curls quotes in prose and can be turned off in Settings', async ({ page }) => {
  await newNovel(page);
  await page.keyboard.type(' "Yes," she said -- quietly...');
  await expect(scene(page)).toContainText('“Yes,” she said — quietly…');

  await page.getByRole('link', { name: 'Settings' }).click();
  const prose = page.getByRole('switch', { name: 'Smart punctuation in prose' });
  await expect(prose).toBeChecked();
  await expect(page.getByRole('switch', { name: 'Smart punctuation in poems' })).not.toBeChecked();
  await prose.click();
  await page.goBack();
  await scene(page).click();
  await page.keyboard.press(`${mod}+End`);
  await page.keyboard.type(' "plain"');
  await expect(scene(page)).toContainText('quietly… "plain"');
});

test('a gradient preset applies from the selection menu, keeps typing readable and stops in Calm mode', async ({
  page,
}) => {
  await newNovel(page);
  await selectWord(page, 'harbour');
  await bubble(page).getByRole('button', { name: 'Gradient and shimmer' }).click();
  const panel = page.getByRole('dialog', { name: 'Gradient and shimmer' });
  await panel.getByRole('button', { name: 'Gold leaf' }).click();
  await expect(panel.getByText(/Lowest contrast \d+\.\d:1 on this page/)).toBeVisible();
  const run = scene(page).locator('span.vlo-fill');
  await expect(run).toHaveText('harbour');
  await expect(run).toHaveClass(/vlo-fill-metallic/);

  // The angle dial and the look work by keyboard.
  await panel.getByRole('slider', { name: 'Angle' }).focus();
  await page.keyboard.press('Shift+ArrowRight');
  await expect(panel.getByRole('slider', { name: 'Angle' })).toHaveAttribute('aria-valuenow', '105');
  await panel.getByRole('radio', { name: 'Glow' }).click();
  await expect(run).toHaveClass(/vlo-fill-glow/);
  await page.keyboard.press('Escape');
  await expect(scene(page)).toBeFocused();

  // Typing at the end of the run joins it, and the caret keeps the theme text color (Review Focus 1).
  await selectWord(page, 'harbour');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.type('side');
  await expect(run).toHaveText('harbourside');
  const caret = await run.evaluate((el) => getComputedStyle(el).caretColor);
  const text = await scene(page).evaluate((el) => getComputedStyle(el).color);
  expect(caret).toBe(text);

  await expect(page.getByRole('status').filter({ hasText: /Saved/ })).toHaveText('Saved');
  await page.reload();
  await expect(run).toHaveText('harbourside');
  await expect(run).toHaveClass(/vlo-fill-shimmer/);
  await page.evaluate(() => {
    document.documentElement.dataset.calm = 'true';
  });
  await expect.poll(() => run.evaluate((el) => getComputedStyle(el).animationName)).toBe('none');
});

test('a saved look comes back in the gradient editor', async ({ page }) => {
  await newNovel(page);
  await selectWord(page, 'lights');
  await bubble(page).getByRole('button', { name: 'Gradient and shimmer' }).click();
  const panel = page.getByRole('dialog', { name: 'Gradient and shimmer' });
  await panel.getByRole('button', { name: 'Aurora' }).click();
  await panel.getByLabel('Save this look as').fill('Night sea');
  await panel.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(panel.getByRole('button', { name: 'Use Night sea' })).toBeVisible();
  await panel.getByRole('button', { name: 'Remove gradient' }).click();
  await expect(scene(page).locator('span.vlo-fill')).toHaveCount(0);
  await panel.getByRole('button', { name: 'Use Night sea' }).click();
  await expect(scene(page).locator('span.vlo-fill-glow')).toHaveText('lights');
});
