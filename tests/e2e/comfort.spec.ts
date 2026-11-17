import { expect, test } from '@playwright/test';
import { seriousIssues } from './support/axe';
import { skipOnboarding, writeWithoutAccount } from './support/onboarding';
import { useTool } from './support/tools';

// A signed-out visit opens on the sign-in screen; these tests write with no account.
test.beforeEach(async ({ page }) => {
  await writeWithoutAccount(page);
});

/* Plan Task G8 (roadmap F37): the comfort settings change the editor on this device only. */

test('wider spacing and the comfort font change the editor text', async ({ page }) => {
  await skipOnboarding(page);
  await page.goto('/settings');
  await page.getByRole('switch', { name: 'Show my text in Atkinson Hyperlegible Next' }).click();
  const spacing = {
    'Space between letters': '0.1',
    'Space between words': '0.2',
    'Space between lines': '2.3',
  };
  for (const [name, value] of Object.entries(spacing))
    await page.getByRole('spinbutton', { name }).fill(value);
  await page.getByRole('radio', { name: 'Contrast' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'contrast');
  expect(await seriousIssues(page)).toEqual([]);

  await page.goto('/');
  await page.getByRole('button', { name: 'New project' }).click();
  await page
    .getByRole('dialog', { name: 'New project' })
    .getByRole('button', { name: 'Create project' })
    .click();
  const editor = page.getByRole('textbox', { name: 'Scene 1' });
  await expect(editor).toBeFocused();
  const style = await editor.evaluate((element) => {
    const s = getComputedStyle(element);
    return {
      font: s.fontFamily,
      line: parseFloat(s.lineHeight) / parseFloat(s.fontSize),
      letter: parseFloat(s.letterSpacing) / parseFloat(s.fontSize),
      word: parseFloat(s.wordSpacing) / parseFloat(s.fontSize),
    };
  });
  expect(style.font).toContain('Atkinson Hyperlegible Next');
  expect(style.line).toBeCloseTo(2.3, 2);
  expect(style.letter).toBeCloseTo(0.1, 2);
  expect(style.word).toBeCloseTo(0.2, 2);
});

test('the Spacing panel of a poem changes the space between letters', async ({ page }) => {
  await skipOnboarding(page);
  await page.getByRole('button', { name: 'New project' }).click();
  const dialog = page.getByRole('dialog', { name: 'New project' });
  await dialog.getByRole('checkbox', { name: /Poetry collection/ }).click();
  await dialog.getByRole('button', { name: 'Create project' }).click();
  const editor = page.getByRole('textbox', { name: 'Poem 1' });
  await expect(editor).toBeFocused();
  await useTool(page, 'Spacing');
  await page.getByRole('spinbutton', { name: 'Space between letters' }).fill('0.25');
  const letter = await editor.evaluate((element) => {
    const s = getComputedStyle(element);
    return parseFloat(s.letterSpacing) / parseFloat(s.fontSize);
  });
  expect(letter).toBeCloseTo(0.25, 2);
});
