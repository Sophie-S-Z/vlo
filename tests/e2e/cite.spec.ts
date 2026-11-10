import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { seriousIssues } from './support/axe';
import { skipOnboarding } from './support/onboarding';

/*
 * Plan Tasks M5 to M7 (roadmap 2 F64): a source typed in, a citation from the / menu, a change of style,
 * and a Markdown export that ends with the reference list.
 */

test('a citation from the / menu follows the style, and an export ends with the list', async ({ page }) => {
  await skipOnboarding(page);
  await page.getByRole('button', { name: 'New project' }).click();
  const dialog = page.getByRole('dialog', { name: 'New project' });
  await dialog.getByRole('checkbox', { name: /Open writing/ }).click();
  await dialog.getByRole('button', { name: 'Create project' }).click();
  const text = page.getByRole('textbox', { name: 'Page 1' });
  await expect(text).toBeFocused();
  await page.keyboard.type('The crossing took a night ');
  await page.keyboard.type('/cite');
  await expect(page.getByRole('option', { name: /^Cite a source/ })).toBeVisible();
  await page.keyboard.press('Enter');

  const panel = page.getByRole('dialog', { name: 'Cite a source' });
  // The word count rolls in after a typing pause. Axe must not read it half faded.
  await expect(page.getByText('5 words', { exact: true })).toBeVisible();
  await panel.getByRole('button', { name: 'Add a source' }).click();
  const form = panel.getByRole('form', { name: 'Add a source' });
  await form.getByLabel('Authors').fill('Marlow, Ada\nQuill, Jonah');
  await form.getByLabel('Title').fill('Night Ferry');
  await form.getByLabel('Publisher').fill('Harbour Press');
  await form.getByLabel('Year').fill('2019');
  expect(await seriousIssues(page)).toEqual([]);
  await form.getByRole('button', { name: 'Save' }).click();
  await expect(panel.getByRole('status')).toHaveText('Added Night Ferry.');
  expect(await seriousIssues(page)).toEqual([]);
  await panel.getByLabel('Page').fill('12');
  await panel.getByRole('button', { name: 'Cite Marlow and Quill 2019, Night Ferry' }).click();
  const cite = text.locator('.vlo-cite');
  await expect(cite).toHaveText('(Marlow & Quill, 2019, p. 12)');

  // Style changes each citation at once.
  await page.keyboard.type('. /cite');
  await page.keyboard.press('Enter');
  await panel.getByLabel('Style').selectOption('mla');
  await expect(cite).toHaveText('(Marlow and Quill 12)');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('status').filter({ hasText: /Saved/ })).toHaveText('Saved');

  await page.getByRole('button', { name: 'Export' }).click();
  const exportDialog = page.getByRole('dialog', { name: 'Export' });
  await exportDialog.getByRole('radio', { name: /Markdown/ }).click();
  const download = page.waitForEvent('download');
  await exportDialog.getByRole('button', { name: 'Export', exact: true }).click();
  const file = await readFile(await (await download).path(), 'utf8');
  expect(file).toContain('The crossing took a night (Marlow and Quill 12). ');
  expect(file).toContain(
    '## Works Cited\n\nMarlow, Ada, and Jonah Quill. *Night Ferry*. Harbour Press, 2019.',
  );
});
