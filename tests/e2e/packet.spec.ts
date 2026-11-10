import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import JSZip from 'jszip';
import { seriousIssues } from './support/axe';
import { skipOnboarding } from './support/onboarding';

/* Plan Task J3 (roadmap F53): a submission packet is one zip, and Vlo logs it as sent. */

test('a packet saves the pieces and the texts in one zip, logs the row, and keeps the letter', async ({
  page,
}) => {
  await skipOnboarding(page);
  await page.getByRole('button', { name: 'New project' }).click();
  const newProject = page.getByRole('dialog', { name: 'New project' });
  await newProject.getByRole('checkbox', { name: /Poetry/ }).click();
  await newProject.getByRole('button', { name: 'Create project' }).click();
  await expect(page.getByRole('textbox', { name: 'Poem 1' })).toBeFocused();
  await page.keyboard.type('Salt on the sill.');
  await expect(page.getByRole('status').filter({ hasText: /Saved/ })).toHaveText('Saved');
  await page
    .getByRole('navigation', { name: 'Project views' })
    .getByRole('link', { name: 'Submissions' })
    .click();

  await page.getByRole('button', { name: 'Make a packet' }).click();
  const dialog = page.getByRole('dialog', { name: 'Make a packet' });
  await dialog.getByRole('button', { name: 'Save the packet' }).click();
  await expect(dialog.getByRole('alert')).toHaveText('Choose at least one piece.');

  await dialog.getByRole('checkbox', { name: 'Poem 1' }).check();
  await dialog.getByLabel('Venue').fill('Agni');
  await dialog.getByLabel('Cover letter').fill('Dear editors,\n\nHere is one poem.');
  await dialog.getByLabel('Bio').fill('I write by the sea.');
  await dialog.getByRole('radio', { name: 'PDF' }).click();
  expect(await seriousIssues(page)).toEqual([]);

  const download = page.waitForEvent('download');
  await dialog.getByRole('button', { name: 'Save the packet' }).click();
  const file = await download;
  expect(file.suggestedFilename()).toBe('Packet for Agni.zip');
  const zip = await JSZip.loadAsync(await readFile(await file.path()));
  expect(Object.keys(zip.files)).toEqual(['Poem 1.pdf', 'Cover letter.pdf', 'Bio.pdf']);

  const done = page.getByRole('dialog', { name: 'Your packet is ready' });
  await expect(done).toContainText('logged it as sent to Agni today');
  await done.getByRole('button', { name: 'Done' }).click();
  await expect(page.locator('tbody tr')).toHaveCount(1);
  await expect(page.locator('tbody tr')).toContainText('Agni');

  await page.reload();
  await page.getByRole('button', { name: 'Make a packet' }).click();
  await expect(dialog.getByLabel('Cover letter')).toHaveValue('Dear editors,\n\nHere is one poem.');
  await expect(dialog.getByLabel('Bio')).toHaveValue('I write by the sea.');
});
