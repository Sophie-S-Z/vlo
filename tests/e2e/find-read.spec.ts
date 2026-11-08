import { expect, test, type Page } from '@playwright/test';
import { seriousIssues } from './support/axe';
import { skipOnboarding } from './support/onboarding';
import { editorSelection } from './support/selection';

/*
 * Task A10: find and replace (E1), read aloud (E2) and writing stats (E4).
 */

declare global {
  interface Window {
    __spoken: { text: string; voice: string | undefined; rate: number }[];
    __finishSentence: () => void;
  }
}

const text = (page: Page) => page.getByRole('textbox', { name: 'Scene 1' });
const bar = (page: Page) => page.getByRole('search', { name: 'Find and replace' });
const findField = (page: Page) => bar(page).getByRole('textbox', { name: 'Find' });
const replaceField = (page: Page) => bar(page).getByRole('textbox', { name: 'Replace with' });
const count = (page: Page) => bar(page).getByRole('status').first();

async function newNovel(page: Page, words: string) {
  await skipOnboarding(page);
  await page.getByRole('button', { name: 'New project' }).click();
  await page
    .getByRole('dialog', { name: 'New project' })
    .getByRole('button', { name: 'Create project' })
    .click();
  await expect(text(page)).toBeFocused();
  await page.keyboard.insertText(words);
  await expect(text(page)).toContainText(words);
}

/** A speech engine with two voices on the device and one that would send the text to a server. */
async function fakeSpeech(page: Page, voices: 'some' | 'none' = 'some') {
  await page.addInitScript((kind) => {
    const all =
      kind === 'none'
        ? [{ voiceURI: 'cloud', name: 'Cloud voice', lang: 'en-US', localService: false, default: true }]
        : [
            { voiceURI: 'cloud', name: 'Cloud voice', lang: 'en-US', localService: false, default: false },
            { voiceURI: 'moira', name: 'Moira', lang: 'en-IE', localService: true, default: true },
            { voiceURI: 'daniel', name: 'Daniel', lang: 'en-GB', localService: true, default: false },
          ];
    window.__spoken = [];
    let current: { onend: ((e: Event) => void) | null; onerror: ((e: Event) => void) | null } | null = null;
    const synth = Object.assign(new EventTarget(), {
      getVoices: () => all,
      speak(u: {
        text: string;
        voice: { voiceURI: string } | null;
        rate: number;
        onend: ((e: Event) => void) | null;
        onerror: ((e: Event) => void) | null;
      }) {
        window.__spoken.push({ text: u.text, voice: u.voice?.voiceURI, rate: u.rate });
        current = u;
      },
      cancel() {
        const u = current;
        current = null;
        u?.onerror?.(Object.assign(new Event('error'), { error: 'canceled' }));
      },
      pause: () => undefined,
      resume: () => undefined,
    });
    window.__finishSentence = () => {
      const u = current;
      current = null;
      u?.onend?.(new Event('end'));
    };
    Object.defineProperty(window, 'speechSynthesis', { value: synth, configurable: true });
    Object.defineProperty(window, 'SpeechSynthesisUtterance', {
      configurable: true,
      value: class {
        voice = null;
        rate = 1;
        lang = '';
        onend = null;
        onerror = null;
        constructor(public text: string) {}
      },
    });
  }, voices);
}

const spoken = (page: Page) => page.evaluate(() => window.__spoken);

async function openReadAloud(page: Page) {
  await page.getByRole('button', { name: 'More tools' }).click();
  await page.getByRole('menuitem', { name: /Read aloud/ }).click();
  const panel = page.getByRole('dialog', { name: 'Read aloud' });
  await expect(panel).toBeVisible();
  return panel;
}

test('find and replace: count, step, match case, whole word, replace one and all, and undo', async ({
  page,
}) => {
  await newNovel(page, 'The rain fell. The rainy day went on. Rain again, and the rain stopped.');
  await page.keyboard.press('ControlOrMeta+f');
  await expect(findField(page)).toBeFocused();
  await page.keyboard.type('rain');
  await expect(count(page)).toHaveText('1 of 4');
  await expect(text(page).locator('.vlo-find-match')).toHaveCount(4);
  await page.keyboard.press('Enter');
  await expect(count(page)).toHaveText('2 of 4');
  await page.keyboard.press('Shift+Enter');
  await page.keyboard.press('Shift+Enter');
  await expect(count(page)).toHaveText('4 of 4');

  await bar(page).getByRole('button', { name: 'Match case' }).click();
  await expect(bar(page).getByRole('button', { name: 'Match case' })).toHaveAttribute('aria-pressed', 'true');
  await expect(count(page)).toHaveText(/of 3$/);
  await bar(page).getByRole('button', { name: 'Whole word' }).click();
  await expect(count(page)).toHaveText(/of 2$/);
  await bar(page).getByRole('button', { name: 'Match case' }).click();
  await expect(count(page)).toHaveText(/of 3$/);

  await replaceField(page).fill('snow');
  await bar(page).getByRole('button', { name: 'Replace', exact: true }).click();
  await expect(bar(page).getByText('Replaced 1. 2 left.')).toBeVisible();
  await bar(page).getByRole('button', { name: 'Replace all' }).click();
  await expect(bar(page).getByText('Replaced 2. Undo puts them all back.')).toBeVisible();
  await expect(text(page)).toHaveText(
    'The snow fell. The rainy day went on. snow again, and the snow stopped.',
  );
  await expect(count(page)).toHaveText('No matches');
  await expect(findField(page)).toBeFocused();

  // Escape returns to the text. One Undo puts back every word that Replace all changed.
  await page.keyboard.press('Escape');
  await expect(bar(page)).toHaveCount(0);
  await expect(text(page)).toBeFocused();
  await page.keyboard.press('ControlOrMeta+z');
  await expect(text(page)).toHaveText(
    'The snow fell. The rainy day went on. Rain again, and the rain stopped.',
  );
});

test('Mod-H opens the bar at Replace; selected words become the search; Escape selects the match', async ({
  page,
}) => {
  await newNovel(page, 'Desk, a lamp, a lamp again.');
  // Select "Desk" with the keyboard. A caret move right after inserted text can be lost, so the keys repeat
  // until the editor holds the selection.
  await expect(async () => {
    await page.keyboard.press('ControlOrMeta+Home');
    for (let i = 0; i < 4; i++) await page.keyboard.press('Shift+ArrowRight');
    await expect.poll(async () => (await editorSelection(text(page))).text, { timeout: 1000 }).toBe('Desk');
  }).toPass();
  await page.keyboard.press('ControlOrMeta+f');
  await expect(findField(page)).toHaveValue('Desk');
  await expect(count(page)).toHaveText('1 of 1');
  await page.keyboard.press('Escape');
  await expect(text(page)).toBeFocused();
  await page.keyboard.type('Table');
  await expect(text(page)).toHaveText('Table, a lamp, a lamp again.');

  await page.keyboard.press('ControlOrMeta+h');
  await expect(replaceField(page)).toBeFocused();
  await findField(page).fill('lamp');
  await replaceField(page).fill('candle');
  await replaceField(page).press('ControlOrMeta+Enter');
  await expect(text(page)).toHaveText('Table, a candle, a candle again.');
  await page.keyboard.press('Escape');
  await expect(bar(page)).toHaveCount(0);
});

test('find works in a poem and keeps its spaces', async ({ page }) => {
  await skipOnboarding(page);
  await page.getByRole('button', { name: 'New project' }).click();
  const dialog = page.getByRole('dialog', { name: 'New project' });
  await dialog.getByRole('checkbox', { name: /Poetry collection/ }).click();
  await dialog.getByRole('button', { name: 'Create project' }).click();
  const poem = page.getByRole('textbox', { name: 'Poem 1' });
  await expect(poem).toBeFocused();
  await page.keyboard.type('the  wide   sea');
  await page.keyboard.press('Enter');
  await page.keyboard.type('the sea');
  await page.keyboard.press('ControlOrMeta+f');
  await page.keyboard.type('wide   sea');
  await expect(count(page)).toHaveText('1 of 1');
  await findField(page).fill('sea');
  await expect(count(page)).toHaveText(/of 2$/);
});

test('read aloud uses on-device voices only, marks each sentence, and Pause and Stop work', async ({
  page,
  baseURL,
}) => {
  const outside: string[] = [];
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (
      url.protocol !== 'data:' &&
      url.protocol !== 'blob:' &&
      url.origin !== new URL(baseURL ?? '/').origin
    ) {
      outside.push(request.url());
    }
  });
  await fakeSpeech(page);
  await newNovel(page, 'The tide came in. The gulls went quiet.');
  await page.keyboard.press('Enter');
  await page.keyboard.insertText('Night fell.');
  // A caret move right after inserted text can be lost, so the key repeats until the editor holds it.
  await expect(async () => {
    await page.keyboard.press('ControlOrMeta+Home');
    await expect.poll(async () => (await editorSelection(text(page))).from, { timeout: 1000 }).toBe(1);
  }).toPass();

  const panel = await openReadAloud(page);
  const voice = panel.getByRole('combobox', { name: 'Voice' });
  await expect(voice.locator('option')).toHaveText(['Moira (en-IE)', 'Daniel (en-GB)']);
  await voice.selectOption('daniel');
  await panel.getByRole('slider', { name: 'Speed' }).fill('1.5');
  await panel.getByRole('button', { name: 'Read from the cursor' }).click();
  await expect.poll(() => spoken(page)).toEqual([{ text: 'The tide came in.', voice: 'daniel', rate: 1.5 }]);
  await expect(text(page).locator('.vlo-reading')).toHaveText('The tide came in.');

  // The bar under the toolbar holds Pause and Stop while the panel is closed.
  await page.keyboard.press('Escape');
  const reading = page.getByRole('region', { name: 'Read aloud' });
  await expect(reading).toContainText('Reading sentence 1 of 3');
  await page.evaluate(() => {
    window.__finishSentence();
  });
  await expect(text(page).locator('.vlo-reading')).toHaveText('The gulls went quiet.');
  await reading.getByRole('button', { name: 'Pause' }).click();
  await expect(reading).toContainText('Paused at sentence 2 of 3');
  await reading.getByRole('button', { name: 'Resume' }).click();
  await expect
    .poll(async () => (await spoken(page)).map((s) => s.text))
    .toEqual(['The tide came in.', 'The gulls went quiet.', 'The gulls went quiet.']);
  await reading.getByRole('button', { name: 'Stop reading' }).click();
  await expect(reading).toHaveCount(0);
  await expect(text(page).locator('.vlo-reading')).toHaveCount(0);
  expect(outside).toEqual([]);

  // A selection reads only the selected words. The voice and speed stay on this device.
  await page.reload();
  await expect(text(page)).toBeVisible();
  await text(page).click();
  await page.keyboard.press('ControlOrMeta+End');
  await page.keyboard.press('Shift+Home');
  const again = await openReadAloud(page);
  await expect(again.getByRole('combobox', { name: 'Voice' })).toHaveValue('daniel');
  await again.getByRole('button', { name: 'Read the selection' }).click();
  await expect.poll(async () => (await spoken(page)).at(-1)?.text).toBe('Night fell.');
});

test('read aloud says why it cannot read when the device has no on-device voice', async ({ page }) => {
  await fakeSpeech(page, 'none');
  await newNovel(page, 'Quiet words.');
  const panel = await openReadAloud(page);
  await expect(panel).toContainText('This device has no on-device voices');
  await expect(panel.getByRole('combobox', { name: 'Voice' })).toHaveCount(0);
  expect(await spoken(page)).toEqual([]);
});

test('writing stats show the open item, the selection and the words written today', async ({ page }) => {
  await newNovel(page, 'The sea is calm. The boats are in.');
  await page.getByRole('button', { name: 'Show details' }).click();
  const stats = page.getByRole('region', { name: 'Writing stats' });
  const row = (term: string) => stats.getByText(term, { exact: true }).locator('..').getByRole('definition');
  await expect(row('Words')).toHaveText('8');
  await expect(row('Sentences')).toHaveText('2');
  await expect(row('Reading time')).toHaveText('under 1 min');
  await expect(row('Written today')).toHaveText('8 words');

  await text(page).click();
  await page.keyboard.press('ControlOrMeta+End');
  await page.keyboard.press('Shift+Home');
  await expect(row('Selected')).toHaveText('8 words');
  await page.keyboard.press('End');
  await page.keyboard.insertText(' Night came on.');
  await expect(row('Words')).toHaveText('11');
  await expect(row('Written today')).toHaveText('11 words');
});

test('the find bar, the read aloud panel and the stats have no serious axe issues and fit 360 px', async ({
  page,
}) => {
  await fakeSpeech(page);
  await newNovel(page, 'Ink on paper. Paper on ink.');
  await page.keyboard.press('ControlOrMeta+f');
  await page.keyboard.type('ink');
  await page.getByRole('button', { name: 'Show details' }).click();
  await expect(page.getByText('6 words', { exact: true }).first()).toBeVisible();
  // The word count rolls in when it changes. Axe checks it once it has settled.
  await expect
    .poll(() => page.evaluate(() => document.getAnimations().filter((a) => a.playState === 'running').length))
    .toBe(0);
  expect(await seriousIssues(page)).toEqual([]);
  await text(page).click();
  await openReadAloud(page);
  expect(await seriousIssues(page)).toEqual([]);
  await page.keyboard.press('Escape');

  await page.setViewportSize({ width: 360, height: 740 });
  await text(page).click();
  await page.keyboard.press('ControlOrMeta+f');
  await expect(bar(page)).toBeVisible();
  const box = await bar(page).boundingBox();
  expect(box && box.x >= 0 && box.x + box.width <= 360).toBe(true);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});
