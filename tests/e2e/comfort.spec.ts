import { expect, test } from '@playwright/test';
import { seriousIssues } from './support/axe';
import { skipOnboarding } from './support/onboarding';

/* Plan Task G8 (roadmap F37): the comfort settings change the editor on this device only. */

test('the widest comfort settings and the comfort font change the editor text', async ({ page }) => {
  await skipOnboarding(page);
  await page.goto('/settings');
  await page.getByRole('switch', { name: 'Show my text in Atkinson Hyperlegible Next' }).click();
  for (const group of ['Space between letters', 'Space between words', 'Space between lines'])
    await page.getByRole('radiogroup', { name: group }).getByRole('radio', { name: 'Widest' }).click();
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
