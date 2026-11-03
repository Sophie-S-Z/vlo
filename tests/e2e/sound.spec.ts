import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { seriousIssues } from './support/axe';
import { skipOnboarding } from './support/onboarding';

/*
 * Task A9: sound. Nothing plays before Play, Calm mode keeps a scene from starting its sound, the writer's
 * own files play from the device, and no sound sends a request (US09).
 */

declare global {
  interface Window {
    __audio: { contexts: AudioContext[]; plays: string[]; oscillators: number };
  }
}

const text = (page: Page) => page.getByRole('textbox', { name: 'Scene 1' });
const soundButton = (page: Page) => page.getByRole('button', { name: /^Sound:/ });
const panel = (page: Page) => page.getByRole('dialog', { name: 'Sound' });
const status = (page: Page) => panel(page).getByRole('status');

/** Counts audio contexts, media plays and oscillators, so a test can see what makes sound. */
async function watchAudio(page: Page) {
  await page.addInitScript(() => {
    window.__audio = { contexts: [], plays: [], oscillators: 0 };
    const Real = window.AudioContext;
    window.AudioContext = class extends Real {
      constructor(options?: AudioContextOptions) {
        super(options);
        window.__audio.contexts.push(this);
      }
    };
    // The wrappers below call the real methods with the same `this`.
    // eslint-disable-next-line @typescript-eslint/unbound-method
    const createOscillator = BaseAudioContext.prototype.createOscillator;
    BaseAudioContext.prototype.createOscillator = function (this: BaseAudioContext) {
      window.__audio.oscillators += 1;
      return createOscillator.call(this);
    };
    // eslint-disable-next-line @typescript-eslint/unbound-method
    const play = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function (this: HTMLMediaElement) {
      window.__audio.plays.push(this.currentSrc || this.src);
      return play.call(this);
    };
  });
}

const audioState = (page: Page) =>
  page.evaluate(() => ({
    contexts: window.__audio.contexts.map((c) => c.state),
    plays: window.__audio.plays,
    oscillators: window.__audio.oscillators,
  }));

async function newNovel(page: Page) {
  await skipOnboarding(page);
  await page.getByRole('button', { name: 'New project' }).click();
  await page
    .getByRole('dialog', { name: 'New project' })
    .getByRole('button', { name: 'Create project' })
    .click();
  await expect(text(page)).toBeFocused();
}

async function pickScene(page: Page, name: string) {
  await page.getByRole('button', { name: /^Scene:/ }).click();
  await page.getByRole('radiogroup', { name: 'Scene' }).getByRole('radio', { name }).click();
  await page.keyboard.press('Escape');
  // The scene panel gives focus back to its button when it finishes closing. Wait for that, or the
  // focus would land after the sound panel opens and close it.
  await expect(page.getByRole('dialog', { name: 'Scene' })).toBeHidden();
  await expect(page.getByRole('button', { name: /^Scene:/ })).toBeFocused();
}

async function openSound(page: Page) {
  await soundButton(page).click();
  await expect(panel(page)).toBeVisible();
}

/** A short, quiet WAV file: 8 kHz, 16-bit, mono. */
function wav(seconds: number): Buffer {
  const rate = 8000;
  const samples = rate * seconds;
  const data = Buffer.alloc(samples * 2);
  for (let i = 0; i < samples; i++) data.writeInt16LE(Math.round(Math.sin(i / 8) * 600), i * 2);
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + data.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(rate, 24);
  header.writeUInt32LE(rate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}

test('nothing plays before Play; Play starts the music and the scene, and leaving the project stops it', async ({
  page,
}) => {
  await watchAudio(page);
  await newNovel(page);
  await pickScene(page, 'Rainy window');
  await openSound(page);
  await expect(status(page)).toHaveText('Sound is off. Nothing plays until you press Play.');
  expect(await audioState(page)).toEqual({ contexts: [], plays: [], oscillators: 0 });

  await panel(page).getByRole('button', { name: 'Play', exact: true }).click();
  await expect(status(page)).toHaveText('Playing Lofi, rain and wind.');
  await expect(soundButton(page)).toHaveAccessibleName('Sound: playing');
  await expect.poll(async () => (await audioState(page)).contexts).toEqual(['running']);
  await expect.poll(async () => (await audioState(page)).oscillators).toBeGreaterThan(0);

  await panel(page).getByRole('radio', { name: 'Dream pop' }).click();
  await expect(status(page)).toHaveText('Playing Dream pop, rain and wind.');
  await panel(page).getByRole('slider', { name: 'Stream' }).fill('40');
  await expect(status(page)).toHaveText('Playing Dream pop, rain, wind and stream.');
  await expect(panel(page).getByRole('switch', { name: 'Match the scene' })).not.toBeChecked();

  // The choices stay on this device. Playing never does: a reload is silent until Play.
  await page.reload();
  await expect(text(page)).toBeVisible();
  await expect(soundButton(page)).toHaveAccessibleName('Sound: off');
  await openSound(page);
  await expect(panel(page).getByRole('radio', { name: 'Dream pop' })).toBeChecked();
  await expect(panel(page).getByRole('slider', { name: 'Stream' })).toHaveValue('40');
  expect((await audioState(page)).contexts).toEqual([]);

  await panel(page).getByRole('button', { name: 'Play', exact: true }).click();
  await expect(soundButton(page)).toHaveAccessibleName('Sound: playing');
  await page.keyboard.press('Escape');
  await page.getByRole('link', { name: 'Library' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Library' })).toBeVisible();
  await page
    .getByRole('link', { name: /Untitled novel/ })
    .first()
    .click();
  await expect(soundButton(page)).toHaveAccessibleName('Sound: off');
});

test('in Calm mode a scene starts no sound and key sounds stay off, while chosen music still plays', async ({
  page,
}) => {
  await page.addInitScript(() => {
    localStorage.setItem('vlo:preferences', JSON.stringify({ theme: 'system', calm: true }));
  });
  await watchAudio(page);
  await newNovel(page);
  await pickScene(page, 'Fireplace');
  await openSound(page);
  await expect(
    panel(page).getByText('Calm mode is on, so the scene does not start its sounds.', { exact: false }),
  ).toBeVisible();
  await expect(panel(page).getByRole('slider', { name: 'Fire' })).toHaveValue('0');
  await expect(panel(page).getByRole('switch', { name: 'Typewriter keys' })).toBeDisabled();

  await panel(page).getByRole('button', { name: 'Play', exact: true }).click();
  await expect(status(page)).toHaveText('Playing Lofi.');
  // A sound the writer picks by hand is a choice, so it plays in Calm mode too.
  await panel(page).getByRole('slider', { name: 'Rain' }).fill('50');
  await expect(status(page)).toHaveText('Playing Lofi and rain.');
});

test('typewriter keys click while typing once the writer turns them on', async ({ page }) => {
  await watchAudio(page);
  await newNovel(page);
  await openSound(page);
  await panel(page).getByRole('switch', { name: 'Typewriter keys' }).click();
  await expect.poll(async () => (await audioState(page)).contexts).toEqual(['running']);
  await page.keyboard.press('Escape');
  await text(page).click();
  const before = (await audioState(page)).oscillators;
  await page.keyboard.type('Ink.');
  await page.keyboard.press('Enter');
  // One thump for each key and two tones for the Enter bell.
  await expect.poll(async () => (await audioState(page)).oscillators - before).toBe(6);
  await expect(soundButton(page)).toHaveAccessibleName('Sound: off');
});

test('own music: a file plays from the device and stays after a reload; bad files get a message', async ({
  page,
}) => {
  await watchAudio(page);
  await newNovel(page);
  await openSound(page);
  const input = panel(page).getByLabel('Music files', { exact: true });
  await input.setInputFiles({ name: 'Rain tape.wav', mimeType: 'audio/wav', buffer: wav(2) });
  const files = panel(page).getByRole('list', { name: 'Your music files' });
  await expect(files.getByRole('listitem')).toHaveCount(1);
  await expect(files).toContainText('Rain tape');
  await expect(files).toContainText('0:02');

  await files.getByRole('button', { name: 'Play Rain tape' }).click();
  await expect(panel(page).getByRole('radio', { name: 'Your music' })).toBeChecked();
  await expect(status(page)).toHaveText('Playing “Rain tape”.');
  await expect
    .poll(async () => (await audioState(page)).plays.some((src) => src.startsWith('blob:')))
    .toBe(true);

  // A broken file, a file that is not music and a file over 50 MB are each refused with a reason.
  const dir = mkdtempSync(join(tmpdir(), 'vlo-sound-'));
  const large = join(dir, 'Long mix.wav');
  writeFileSync(large, Buffer.alloc(51 * 1024 * 1024));
  await input.setInputFiles([
    { name: 'broken.mp3', mimeType: 'audio/mpeg', buffer: Buffer.from('this is not audio at all') },
    { name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('notes') },
  ]);
  const alert = panel(page).getByRole('alert');
  await expect(alert).toContainText('Vlo cannot play “broken.mp3”.');
  await expect(alert).toContainText('“notes.txt” is not a music file.');
  await input.setInputFiles(large);
  await expect(alert).toContainText('“Long mix.wav” is 51 MB. Vlo keeps music files up to 50 MB each.');
  await expect(files.getByRole('listitem')).toHaveCount(1);

  await page.reload();
  await openSound(page);
  await expect(panel(page).getByRole('list', { name: 'Your music files' })).toContainText('Rain tape');
  await panel(page).getByRole('button', { name: 'Remove Rain tape' }).click();
  await expect(panel(page).getByRole('list', { name: 'Your music files' })).toHaveCount(0);
});

test('US09 with sound on: music, nature sounds and own files send no request off the app', async ({
  page,
}) => {
  const outside: string[] = [];
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.protocol !== 'blob:' && url.protocol !== 'data:' && url.origin !== 'http://localhost:4173') {
      outside.push(request.url());
    }
  });
  await newNovel(page);
  await pickScene(page, 'Forest');
  await openSound(page);
  await panel(page)
    .getByLabel('Music files', { exact: true })
    .setInputFiles({ name: 'Brook.wav', mimeType: 'audio/wav', buffer: wav(1) });
  await expect(panel(page).getByRole('list', { name: 'Your music files' })).toContainText('Brook');
  await panel(page).getByRole('button', { name: 'Play', exact: true }).click();
  await expect(status(page)).toHaveText('Playing Lofi, wind, stream and forest birds.');
  await panel(page).getByRole('radio', { name: 'Your music' }).click();
  await expect(status(page)).toHaveText('Playing “Brook”, wind, stream and forest birds.');
  await panel(page).getByRole('switch', { name: 'Typewriter keys' }).click();
  await page.keyboard.press('Escape');
  await text(page).click();
  await page.keyboard.type('The brook ran on under the ferns, and the birds kept time.', { delay: 20 });
  await page.waitForTimeout(1500);
  expect(outside).toEqual([]);
});

test('the sound panel has no serious axe issues and fits a 360 px screen', async ({ page }) => {
  await newNovel(page);
  await page.keyboard.type('Ink and paper.');
  await expect(page.getByText('3 words', { exact: true })).toBeVisible();
  await openSound(page);
  expect(await seriousIssues(page)).toEqual([]);
  await page.keyboard.press('Escape');
  await page.setViewportSize({ width: 360, height: 740 });
  await openSound(page);
  const box = await panel(page).boundingBox();
  expect(box && box.x >= 0 && box.x + box.width <= 360).toBe(true);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});
