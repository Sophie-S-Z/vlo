import { expect, test } from '@playwright/test';
import { skipOnboarding } from './support/onboarding';

/* Plan Task G9 (roadmap F38): a Hebrew poem reads from the right and keeps its indent there. */

test('a Hebrew poem reads from right to left and keeps its hanging indent on the right after a reload', async ({
  page,
}) => {
  await skipOnboarding(page);
  await page.getByRole('button', { name: 'New project' }).click();
  const dialog = page.getByRole('dialog', { name: 'New project' });
  await dialog.getByRole('checkbox', { name: /Poetry collection/ }).click();
  await dialog.getByRole('button', { name: 'Create project' }).click();
  const poem = page.getByRole('textbox', { name: 'Poem 1' });
  await expect(poem).toBeFocused();

  await page.getByRole('button', { name: /^Page:/ }).click();
  await page.getByLabel('Language of the writing').selectOption('he');
  await page.keyboard.press('Escape');

  await poem.click();
  await page.keyboard.type('מלח על האדן');
  await page.getByRole('button', { name: 'More hanging indent' }).click();
  await page.getByRole('button', { name: 'More hanging indent' }).click();
  await expect(page.getByRole('status').filter({ hasText: /Saved/ })).toHaveText('Saved');

  const look = () =>
    poem
      .locator('[data-poem-line]')
      .first()
      .evaluate((line) => {
        const style = getComputedStyle(line);
        return {
          direction: style.direction,
          right: parseFloat(style.paddingRight),
          left: parseFloat(style.paddingLeft),
        };
      });
  for (const reload of [false, true]) {
    if (reload) await page.reload();
    // The spell checker reads the language from the nearest lang attribute.
    await expect.poll(() => poem.evaluate((e) => e.closest('[lang]')?.getAttribute('lang'))).toBe('he');
    const line = await look();
    expect(line.direction).toBe('rtl');
    expect(line.right).toBeGreaterThan(0);
    expect(line.left).toBe(0);
  }
});
