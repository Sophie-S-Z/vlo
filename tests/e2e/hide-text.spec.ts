import { expect, test, type Page } from '@playwright/test';
import { seriousIssues } from './support/axe';
import { skipOnboarding } from './support/onboarding';

/*
 * Hide the text (Ellipsus comparison, October 2026). One press covers the words on the screen with a blur
 * or with bars. The text, the word count and the exports stay the same.
 */

const mod = process.platform === 'darwin' ? 'Meta' : 'Control';

async function novelWithTwoParagraphs(page: Page) {
  await skipOnboarding(page);
  await page.getByRole('button', { name: 'New project' }).click();
  await page
    .getByRole('dialog', { name: 'New project' })
    .getByRole('button', { name: 'Create project' })
    .click();
  const scene = page.getByRole('textbox', { name: 'Scene 1' });
  await expect(scene).toBeFocused();
  await page.keyboard.type('Mira found the wet ledger.');
  await page.keyboard.press('Enter');
  await page.keyboard.type('She kept it.');
  await expect(page.getByText('8 words', { exact: true })).toBeVisible();
  return scene;
}

/** The blur filter and the text color of each paragraph of the scene. */
function looks(page: Page) {
  return page.getByRole('textbox', { name: 'Scene 1' }).evaluate((root) =>
    [...root.children].map((block) => {
      const style = getComputedStyle(block);
      return { filter: style.filter, color: style.color, line: style.textDecorationLine };
    }),
  );
}

test('one press blurs the text, and the words and their count stay the same', async ({ page }) => {
  const scene = await novelWithTwoParagraphs(page);
  const button = page.getByRole('button', { name: 'Hide text' });
  await expect(button).toHaveAttribute('aria-pressed', 'false');
  await page.keyboard.press(`${mod}+Shift+Period`);
  await expect(button).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('html')).toHaveAttribute('data-hide-text', 'blur');
  expect((await looks(page)).every((l) => l.filter.startsWith('blur('))).toBe(true);
  // The text and its count do not change, and the writer can still type.
  await expect(scene).toContainText('Mira found the wet ledger.');
  await page.keyboard.type(' Then ran.');
  await expect(page.getByText('10 words', { exact: true })).toBeVisible();
  expect(await seriousIssues(page)).toEqual([]);

  // The choice stays after a reload, so the words never flash on the screen.
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-hide-text', 'blur');
  await button.click();
  await expect(page.locator('html')).not.toHaveAttribute('data-hide-text');
  expect((await looks(page)).every((l) => l.filter === 'none')).toBe(true);
});

test('bars cover the words, and "Keep my paragraph clear" shows only the paragraph with the caret', async ({
  page,
}) => {
  const scene = await novelWithTwoParagraphs(page);
  await page.getByRole('button', { name: 'Focus' }).click();
  await page.getByRole('menuitemradio', { name: 'Cover the words with bars' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-hide-text', 'bars');
  for (const look of await looks(page)) {
    expect(look.color).toBe('rgba(0, 0, 0, 0)');
    expect(look.line).toBe('line-through');
  }

  await page.getByRole('button', { name: 'Focus' }).click();
  await page.getByRole('menuitemcheckbox', { name: 'Keep my paragraph clear' }).click();
  await scene.getByText('She kept it.').click();
  await expect.poll(async () => (await looks(page)).map((l) => l.line)).toEqual(['line-through', 'none']);
  // With the focus away from the text, every paragraph is covered again.
  await page.getByRole('button', { name: 'Hide text' }).focus();
  await expect
    .poll(async () => (await looks(page)).map((l) => l.line))
    .toEqual(['line-through', 'line-through']);
  expect(await seriousIssues(page)).toEqual([]);

  // Only the project screen hides text. The Library shows its own text as always.
  await page.getByRole('link', { name: 'Library' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Library' })).toBeVisible();
  await expect(page.locator('html')).not.toHaveAttribute('data-hide-text');
});

test('the command menu hides and shows the text', async ({ page }) => {
  await novelWithTwoParagraphs(page);
  await page.keyboard.press(`${mod}+k`);
  await page.getByRole('option', { name: /Hide the text/ }).click();
  await expect(page.locator('html')).toHaveAttribute('data-hide-text', 'blur');
  await page.keyboard.press(`${mod}+k`);
  await page.getByRole('option', { name: /Show the text/ }).click();
  await expect(page.locator('html')).not.toHaveAttribute('data-hide-text');
});
