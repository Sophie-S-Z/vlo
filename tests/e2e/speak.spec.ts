import { expect, test, type Page } from '@playwright/test';
import { seriousIssues } from './support/axe';
import { skipOnboarding, writeWithoutAccount } from './support/onboarding';

// A signed-out visit opens on the sign-in screen; these tests write with no account.
test.beforeEach(async ({ page }) => {
  await writeWithoutAccount(page);
});

/*
 * Plan Task M1 (roadmap 2 F62, Review Focus 1): Speak to write. speak.test.tsx holds live dictation and the
 * closed panel, and segments.test.ts holds the pauses that cut the speech into clips.
 */

const text = (page: Page) => page.getByRole('textbox', { name: 'Poem 1' });

test('Speak to write in a poem asks before any download, and nothing leaves the device', async ({ page }) => {
  const leaving: string[] = [];
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.protocol.startsWith('http') && url.hostname !== 'localhost') leaving.push(url.href);
  });
  await skipOnboarding(page);
  await page.getByRole('button', { name: 'New project' }).click();
  const dialog = page.getByRole('dialog', { name: 'New project' });
  await dialog.getByRole('checkbox', { name: /Poetry/ }).click();
  await dialog.getByRole('button', { name: 'Create project' }).click();
  await expect(text(page)).toBeFocused();
  await page.keyboard.type('Salt on the glass');

  await page.keyboard.press(`${process.platform === 'darwin' ? 'Meta' : 'Control'}+k`);
  await page.getByRole('combobox').fill('dictate');
  await page.getByRole('option', { name: 'Speak to write…' }).click();
  const panel = page.getByRole('dialog', { name: 'Speak to write' });
  await panel.getByRole('button', { name: 'Speak' }).click();

  // The first use asks before the microphone or a download starts.
  const ask = panel.getByRole('region', { name: 'Download the speech model' });
  await expect(ask).toContainText('Whisper small (252 MB) makes the fewest mistakes.');
  await expect(ask.getByRole('button', { name: 'Download the fast model (80 MB)' })).toBeVisible();
  expect(await seriousIssues(page)).toEqual([]);
  await ask.getByRole('button', { name: 'Cancel' }).click();
  await expect(ask).toBeHidden();

  await page.keyboard.press('Escape');
  await expect(panel).toBeHidden();
  await expect(text(page)).toBeFocused();
  await expect(text(page)).toHaveText('Salt on the glass');
  // Nothing left the device: no audio and no model request.
  expect(leaving).toEqual([]);
});
