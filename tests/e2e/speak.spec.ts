import { expect, test, type Page } from '@playwright/test';
import { seriousIssues } from './support/axe';
import { skipOnboarding } from './support/onboarding';

/*
 * Plan Task M1 (roadmap 2 F62, Review Focus 1): Speak to write. speak.test.tsx holds the text, the time
 * limit and the closed panel. A tone from the page stands in for the microphone, so every browser can run it.
 */

const text = (page: Page) => page.getByRole('textbox', { name: 'Poem 1' });

test('Speak to write in a poem asks before any download, and nothing leaves the device', async ({ page }) => {
  const leaving: string[] = [];
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.protocol.startsWith('http') && url.hostname !== 'localhost') leaving.push(url.href);
  });
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = () => {
      const context = new AudioContext();
      const tone = context.createOscillator();
      const out = context.createMediaStreamDestination();
      tone.connect(out);
      tone.start();
      return Promise.resolve(out.stream);
    };
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
  await expect(panel.getByRole('status').filter({ hasText: /^Listening$/ })).toBeVisible();
  await expect(panel.getByText(/^Listening, 0:0\d of 0:30$/)).toBeVisible();
  expect(await seriousIssues(page)).toEqual([]);
  await panel.getByRole('button', { name: 'Stop and write' }).click();

  const ask = panel.getByRole('region', { name: 'Download the speech model' });
  await expect(ask).toContainText('the Whisper base model once (80 MB)');
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
