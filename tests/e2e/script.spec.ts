import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { seriousIssues } from './support/axe';
import { skipOnboarding } from './support/onboarding';

/*
 * Plan Tasks M2 to M4 (roadmap 2 F63): a Script project. Tab and Enter pick each element, the style menu
 * names it, and a Fountain export holds each line in its role.
 */

test('a script takes each element from Tab and Enter, and exports to Fountain', async ({ page }) => {
  await skipOnboarding(page);
  await page.getByRole('button', { name: 'New project' }).click();
  const dialog = page.getByRole('dialog', { name: 'New project' });
  await dialog.getByRole('checkbox', { name: /Script/ }).click();
  await dialog.getByRole('button', { name: 'Create project' }).click();
  const text = page.getByRole('textbox', { name: 'Scene 1' });
  await expect(text).toBeFocused();

  // The first line is action. Tab three times gives a scene heading.
  for (let i = 0; i < 3; i += 1) await page.keyboard.press('Tab');
  await page.keyboard.type('int. ferry cabin - night');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Rain on the glass.');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Tab');
  await page.keyboard.type('Mara');
  await page.keyboard.press('Enter');
  await page.keyboard.type('We left at dawn.');
  await expect(page.getByRole('button', { name: 'Text style: Dialogue' })).toBeVisible();
  await expect(text.locator('p')).toHaveCount(4);
  expect(await text.locator('p').evaluateAll((lines) => lines.map((l) => l.dataset.role))).toEqual([
    'heading',
    'action',
    'character',
    'dialogue',
  ]);
  // The editor shows a heading and a name in capitals, and keeps what the writer typed.
  await expect(text.locator('p').first()).toHaveCSS('text-transform', 'uppercase');
  expect(await seriousIssues(page)).toEqual([]);
  await expect(page.getByRole('status').filter({ hasText: /Saved/ })).toHaveText('Saved');

  await page.getByRole('button', { name: 'Export' }).click();
  const exportDialog = page.getByRole('dialog', { name: 'Export' });
  await exportDialog.getByRole('radio', { name: /Fountain/ }).click();
  expect(await seriousIssues(page)).toEqual([]);
  const download = page.waitForEvent('download');
  await exportDialog.getByRole('button', { name: 'Export', exact: true }).click();
  const file = await download;
  expect(file.suggestedFilename()).toBe('Scene 1.fountain');
  expect(await readFile(await file.path(), 'utf8')).toBe(
    'Title: Scene 1\n\nINT. FERRY CABIN - NIGHT\n\nRain on the glass.\n\nMARA\nWe left at dawn.\n',
  );
});
