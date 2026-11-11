import { createHash } from 'node:crypto';
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

/* Roadmap 2 F68, plan Tasks O2 and O3: a record with a public timestamp, with routed servers. */
test('a record with a public timestamp sends one hash, and /verify gives its Bitcoin date', async ({
  page,
}) => {
  const sent: { host: string; body: Buffer | null }[] = [];
  const cors = { 'access-control-allow-origin': '*' };
  for (const pool of ['a', 'b'])
    await page.route(`https://${pool}.pool.opentimestamps.org/**`, async (route) => {
      sent.push({ host: new URL(route.request().url()).host, body: route.request().postDataBuffer() });
      await route.fulfill({
        body: await readFile(`tests/fixtures/ots/${pool}-pool-answer.bin`),
        headers: cors,
      });
    });

  await skipOnboarding(page);
  await page.getByRole('button', { name: 'New project' }).click();
  await page
    .getByRole('dialog', { name: 'New project' })
    .getByRole('button', { name: 'Create project' })
    .click();
  await expect(page.getByRole('textbox', { name: 'Scene 1' })).toBeFocused();
  await page.keyboard.type('The tide came in.');
  await page.getByRole('button', { name: 'Export' }).click();
  const dialog = page.getByRole('dialog', { name: 'Export' });
  await dialog.getByRole('switch', { name: 'Add a public timestamp' }).click();
  await expect(dialog.getByText('Vlo sends one hash of the record')).toBeVisible();
  const download = page.waitForEvent('download');
  await dialog.getByRole('button', { name: 'Download the record' }).click();
  const record = await readFile(await (await download).path(), 'utf8');
  await expect(dialog.getByRole('status')).toHaveText(
    'The record has a public timestamp. Bitcoin confirms it in a few hours.',
  );
  expect(sent.map((s) => [s.host, s.body?.length]).sort()).toEqual([
    ['a.pool.opentimestamps.org', 32],
    ['b.pool.opentimestamps.org', 32],
  ]);
  expect(record).toContain('"timestamp":"');

  // Alice finishes the proof: one SHA-256, then block 920,000, whose header holds that hash as its root.
  let header = Buffer.alloc(80);
  const sha = (bytes: Buffer) => createHash('sha256').update(bytes).digest();
  const asked: string[] = [];
  await page.route('https://alice.btc.calendar.opentimestamps.org/**', async (route) => {
    asked.push(route.request().url());
    header = Buffer.alloc(80);
    sha(Buffer.from(route.request().url().split('/').pop() ?? '', 'hex')).copy(header, 36);
    header.writeUInt32LE(Date.UTC(2026, 10, 11, 14, 5) / 1000, 68);
    const finished = [0x08, 0x00, 0x05, 0x88, 0x96, 0x0d, 0x73, 0xd7, 0x19, 0x01, 0x03, 0xc0, 0x93, 0x38];
    await route.fulfill({ body: Buffer.from(finished), headers: cors });
  });
  await page.route('https://bob.btc.calendar.opentimestamps.org/**', (route) =>
    route.fulfill({ status: 404, headers: cors }),
  );
  await page.route('https://mempool.space/**', async (route) => {
    asked.push(route.request().url());
    const hash = Buffer.from(sha(sha(header)))
      .reverse()
      .toString('hex');
    const body = route.request().url().endsWith('/header') ? header.toString('hex') : hash;
    await route.fulfill({ body, headers: cors });
  });

  await page.goto('/verify');
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Pick a file' }).click();
  await (
    await chooser
  ).setFiles({
    name: 'record.json',
    mimeType: 'application/json',
    buffer: Buffer.from(record),
  });
  await expect(page.getByRole('status').filter({ hasText: 'passes the check' })).toBeVisible();
  const stamp = page.getByRole('region', { name: 'Public timestamp' });
  await expect(stamp).toBeVisible();
  expect(asked).toEqual([]);
  await stamp.getByRole('button', { name: 'Check the timestamp' }).click();
  await expect(stamp.getByRole('status')).toContainText('Bitcoin block 920,000 holds this record');
  expect(asked.map((url) => new URL(url).host)).toEqual([
    'alice.btc.calendar.opentimestamps.org',
    'mempool.space',
    'mempool.space',
  ]);
  const finished = page.waitForEvent('download');
  await stamp.getByRole('button', { name: 'Download the finished record' }).click();
  const upgraded = await readFile(await (await finished).path(), 'utf8');
  expect(upgraded).not.toBe(record);
  expect(upgraded.slice(0, upgraded.indexOf('"timestamp"'))).toBe(
    record.slice(0, record.indexOf('"timestamp"')),
  );
  expect(await seriousIssues(page)).toEqual([]);
});
