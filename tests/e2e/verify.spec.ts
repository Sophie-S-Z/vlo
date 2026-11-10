import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { seriousIssues } from './support/axe';
import { skipOnboarding } from './support/onboarding';

/* Plan Task K6 (roadmap F54): a record from Export passes on /verify, and a change of one byte fails. */

const THEMES = ['ink', 'paper', 'sepia', 'contrast'] as const;

test('a record from Export passes the check, and fails after a change of one byte', async ({ page }) => {
  await skipOnboarding(page);
  await page.getByRole('button', { name: 'New project' }).click();
  await page
    .getByRole('dialog', { name: 'New project' })
    .getByRole('button', { name: 'Create project' })
    .click();
  const scene = page.getByRole('textbox', { name: 'Scene 1' });
  await expect(scene).toBeFocused();
  await page.keyboard.type('The tide came in.');

  await page.getByRole('button', { name: 'Export' }).click();
  const dialog = page.getByRole('dialog', { name: 'Export' });
  const download = page.waitForEvent('download');
  await dialog.getByRole('button', { name: 'Download the record' }).click();
  const file = await download;
  expect(file.suggestedFilename()).toBe('Untitled novel authorship record.json');
  const record = await readFile(await file.path(), 'utf8');
  expect(record).not.toContain('tide');

  await dialog.getByRole('link', { name: 'verify page' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Check an authorship record');
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Pick a file' }).click();
  const picker = await chooser;
  await picker.setFiles({ name: 'record.json', mimeType: 'application/json', buffer: Buffer.from(record) });
  const passed = page.getByRole('status').filter({ hasText: 'passes the check' });
  await expect(passed).toContainText('“record.json” passes the check.');
  await expect(passed).toContainText('Typed17 characters');
  await expect(passed).toContainText('One device signed it:');
  for (const theme of THEMES) {
    await page.evaluate((t) => {
      document.documentElement.dataset.theme = t;
    }, theme);
    expect(await seriousIssues(page), theme).toEqual([]);
  }

  // The drop zone takes the changed file: one digit of the first entry's time, one byte.
  const changed = record.replace(/"at":(\d)/, (_, d: string) => `"at":${String((Number(d) + 1) % 10)}`);
  expect(changed).not.toBe(record);
  const data = await page.evaluateHandle((text) => {
    const transfer = new DataTransfer();
    transfer.items.add(new File([text], 'changed.json', { type: 'application/json' }));
    return transfer;
  }, changed);
  await page.getByText('Drop a record file here, or pick one.').dispatchEvent('drop', { dataTransfer: data });
  await expect(page.getByRole('alert')).toHaveText(
    '“changed.json” does not pass the check.Entry 1: This entry changed after Vlo signed it.',
  );
  expect(await seriousIssues(page)).toEqual([]);
});
