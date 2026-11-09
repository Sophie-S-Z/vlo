import { expect, test } from '@playwright/test';
import { seriousIssues } from './support/axe';
import { skipOnboarding } from './support/onboarding';

/* Plan Task H8 (roadmap F48): quick capture. capture.test.ts holds the Inbox rules. */

test('a shared page opens the quick note, and the note is in the Inbox after a reload', async ({
  page,
  isMobile,
}) => {
  await skipOnboarding(page);
  await page.getByRole('button', { name: 'New project' }).click();
  await page
    .getByRole('dialog', { name: 'New project' })
    .getByRole('button', { name: 'Create project' })
    .click();
  await expect(page.getByRole('heading', { level: 2, name: 'Scene 1' })).toBeVisible();

  // The share sheet opens the address that the manifest's share target names.
  await page.goto(
    `/capture?title=Harbour&text=${encodeURIComponent('Tides turn twice a day.')}&url=${encodeURIComponent('https://example.com/tides')}`,
  );
  await expect(page.getByRole('heading', { level: 1, name: 'Quick note' })).toBeVisible();
  const text = page.getByRole('textbox', { name: 'Text' });
  await expect(text).toHaveValue('Tides turn twice a day.\nhttps://example.com/tides');
  await expect(page.getByRole('combobox', { name: 'Project' }).locator('option:checked')).toHaveText(
    'Untitled novel',
  );
  expect(await seriousIssues(page)).toEqual([]);

  // A failed save keeps the text on the screen.
  await text.fill(' ');
  await page.getByRole('button', { name: 'Save note' }).click();
  await expect(page.getByRole('alert')).toHaveText('Type or paste the text of the note.');
  await text.fill('Tides turn twice a day.\nhttps://example.com/tides');

  await page.getByRole('button', { name: 'Save note' }).click();
  const note = page.getByRole('textbox', { name: 'Harbour' });
  await expect(note).toContainText('Tides turn twice a day.');
  await page.reload();
  await expect(note).toContainText('https://example.com/tides');
  // The link stays text.
  await expect(note.locator('a')).toHaveCount(0);
  if (isMobile) await page.getByRole('button', { name: 'Binder' }).click();
  const binder = page.getByRole('navigation', { name: 'Binder' });
  await expect(binder.locator('[data-binder-title]')).toHaveText([
    'Inbox',
    'Harbour',
    'Chapter 1',
    'Scene 1',
  ]);
});

test('the manifest names the quick note as a shortcut and as the share target', async ({ page, request }) => {
  await page.goto('/');
  const href = await page.locator('link[rel="manifest"]').getAttribute('href');
  const manifest = (await (await request.get(href ?? '')).json()) as Record<string, unknown>;
  expect(manifest.shortcuts).toEqual([{ name: 'Quick note', url: '/capture' }]);
  expect(manifest.share_target).toEqual({
    action: '/capture',
    method: 'GET',
    params: { title: 'title', text: 'text', url: 'url' },
  });
});
