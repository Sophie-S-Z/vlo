import { expect, test, type Page } from '@playwright/test';
import { seriousIssues } from './support/axe';
import { skipOnboarding } from './support/onboarding';

/*
 * Plan Task K9 (roadmap F57, Review Focus 6): "Record a memory". voice.test.ts holds the model, the worker
 * and the dictated text. A tone from the page stands in for the microphone, so every browser can run it.
 */

const text = (page: Page) => page.getByRole('textbox', { name: 'Memory 1' });

async function newMemoir(page: Page) {
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
  await dialog.getByRole('checkbox', { name: /Memoir/ }).click();
  await dialog.getByRole('button', { name: 'Create project' }).click();
  await expect(text(page)).toBeFocused();
}

test('a memory recording saves with its question, and Turn into text asks before any download', async ({
  page,
}) => {
  const leaving: string[] = [];
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.protocol.startsWith('http') && url.hostname !== 'localhost') leaving.push(url.href);
  });
  await newMemoir(page);
  await page.keyboard.type('It began.');
  await expect(page.getByRole('status').filter({ hasText: /Saved/ })).toHaveText('Saved');
  await page.keyboard.press(`${process.platform === 'darwin' ? 'Meta' : 'Control'}+k`);
  await page.getByRole('combobox').fill('record');
  await page.getByRole('option', { name: 'Record a memory…' }).click();

  const dialog = page.getByRole('dialog', { name: 'Record a memory' });
  const card = dialog.getByRole('region', { name: 'Question' });
  await expect(card).toContainText('Early childhood, question 1 of 60');
  await card.getByRole('button', { name: 'Next' }).click();
  await expect(card).toContainText('question 2 of 60');
  const question = 'Describe the home where you lived as a small child. Walk through it room by room.';
  await expect(card).toContainText(question);
  expect(await seriousIssues(page)).toEqual([]);

  await dialog.getByRole('button', { name: 'Record' }).click();
  await expect(dialog.getByRole('status').filter({ hasText: /^Recording, 0:0\d$/ })).toBeVisible();
  await page.waitForTimeout(1200);
  await dialog.getByRole('button', { name: 'Stop' }).click();
  const clip = dialog.getByRole('listitem').filter({ hasText: question });
  await expect(clip.getByLabel(`Play ${question}`)).toBeVisible();

  await clip.getByRole('button', { name: 'Turn into text' }).click();
  const ask = dialog.getByRole('region', { name: 'Download the speech model' });
  await expect(ask).toContainText('the Whisper base model once (80 MB)');
  expect(await seriousIssues(page)).toEqual([]);
  await ask.getByRole('button', { name: 'Cancel' }).click();
  await expect(ask).toBeHidden();

  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(text(page)).toBeFocused();
  await expect(text(page)).toHaveText('It began.');
  // Nothing left the device: no audio and no model request.
  expect(leaving).toEqual([]);
});
