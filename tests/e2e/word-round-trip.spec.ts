import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import JSZip from 'jszip';
import { REVIEW_TEXT, reviewedDocx } from '../fixtures/review';
import { seriousIssues } from './support/axe';
import { skipOnboarding, writeWithoutAccount } from './support/onboarding';

// A signed-out visit opens on the sign-in screen; these tests write with no account.
test.beforeEach(async ({ page }) => {
  await writeWithoutAccount(page);
});

/* Plan Task I3 (roadmap F45, decision R3): a Word file goes to an editor and comes back with changes. */

const mod = process.platform === 'darwin' ? 'Meta' : 'Control';

test("an editor's Word changes come back as waiting changes and comments", async ({ page }) => {
  await skipOnboarding(page);
  await page.getByRole('button', { name: 'New project' }).click();
  await page
    .getByRole('dialog', { name: 'New project' })
    .getByRole('button', { name: 'Create project' })
    .click();
  const scene = page.getByRole('textbox', { name: 'Scene 1' });
  await expect(scene).toBeFocused();
  await page.keyboard.type(REVIEW_TEXT[0] ?? '');
  await page.keyboard.press('Enter');
  await page.keyboard.type(REVIEW_TEXT[1] ?? '');
  await expect(page.getByRole('status').filter({ hasText: /Saved/ })).toHaveText('Saved');

  // The export marks the scene's section, so the file finds its way back.
  await page.getByRole('button', { name: 'Export' }).click();
  const exportDialog = page.getByRole('dialog', { name: 'Export' });
  await exportDialog.getByRole('switch', { name: 'Keep my tracked changes' }).click();
  await exportDialog.getByRole('switch', { name: 'Include my comments' }).click();
  const download = page.waitForEvent('download');
  await exportDialog.getByRole('button', { name: 'Export', exact: true }).click();
  const zip = await JSZip.loadAsync(await readFile(await (await download).path()));
  const xml = (await zip.file('word/document.xml')?.async('string')) ?? '';
  const bookmark = /w:name="(vlo_[0-9a-f]{32})"/.exec(xml)?.[1] ?? null;
  expect(bookmark).not.toBeNull();
  await page
    .getByRole('dialog', { name: 'Your file is ready' })
    .getByRole('button', { name: 'Done' })
    .click();

  await page.keyboard.press(`${mod}+k`);
  const menu = page.getByRole('dialog', { name: 'Command menu' });
  await menu.getByRole('combobox').fill('editor');
  await menu.getByRole('option', { name: 'Import an editor’s changes…' }).click();
  const dialog = page.getByRole('dialog', { name: 'Import an editor’s changes' });
  await dialog.locator('input[type="file"]').setInputFiles({
    name: 'Scene 1 edited.docx',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    buffer: Buffer.from(await reviewedDocx(bookmark)),
  });
  await expect(dialog.getByRole('status')).toHaveText('Vlo placed 3 changes and 2 comments.');
  expect(await seriousIssues(page)).toEqual([]);
  await dialog.getByRole('button', { name: 'Done' }).click();

  const changes = page.getByRole('region', { name: 'Changes' });
  await expect(changes.getByRole('listitem')).toHaveCount(3);
  await changes.getByRole('button', { name: 'Accept: Inserted by Ana Ruiz “at dawn”' }).click();
  await page.reload();
  await expect(scene).toHaveText(`Mira finds the ledger at dawn.${REVIEW_TEXT[1] ?? ''}She runs.`);
  await expect(changes.getByRole('listitem')).toHaveCount(2);
  // A reply in Word comes back as a reply in the comment's thread.
  await page.keyboard.press(`${mod}+Alt+Shift+a`);
  const comments = page.getByRole('list', { name: 'Open comments' });
  await expect(comments.getByRole('article')).toHaveCount(2);
  const ledger = comments.getByRole('article', { name: 'Comment on “ledger”' });
  await expect(ledger).toContainText('Ana Ruiz');
  await expect(ledger).toContainText('Which ledger?');
  await expect(ledger).toContainText('Ben Ode');
  await expect(ledger).toContainText('The blue one.');
  await page.keyboard.press('Escape');

  // A file that Vlo did not export gets the way to Import writing.
  await page.keyboard.press(`${mod}+k`);
  await menu.getByRole('combobox').fill('editor');
  await menu.getByRole('option', { name: 'Import an editor’s changes…' }).click();
  await dialog.locator('input[type="file"]').setInputFiles({
    name: 'Other.docx',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    buffer: Buffer.from(await reviewedDocx(null)),
  });
  await expect(dialog.getByRole('alert')).toHaveText(
    'This file has no Vlo marks. Use Import writing in the Library to make a new project from it.',
  );
});
