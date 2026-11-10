import { expect, test, type Page } from '@playwright/test';
import { seriousIssues } from './support/axe';
import { skipOnboarding } from './support/onboarding';

/*
 * Plan Task C7: the Craft labels (spec 8.3, F19, Review Focus 6). A poet turns them on for one poem and
 * sees syllable counts, stress marks and rhyme letters. The poem text never changes.
 */

const QUATRAIN = [
  'Shall I compare thee to a summer’s day?',
  'Thou art more lovely and more temperate:',
  'Rough winds do shake the darling buds of May,',
  'And summer’s lease hath all too short a date;',
];

const poem = (page: Page) => page.getByRole('textbox', { name: 'Poem 1' });
const layer = (page: Page) => page.getByTestId('craft-labels');
const legend = /^Craft labels: the syllable count/;

async function newPoem(page: Page) {
  await skipOnboarding(page);
  await page.getByRole('button', { name: 'New project' }).click();
  const dialog = page.getByRole('dialog', { name: 'New project' });
  await dialog.getByRole('checkbox', { name: /Poetry/ }).click();
  await dialog.getByRole('button', { name: 'Create project' }).click();
  await expect(poem(page)).toBeFocused();
}

/** Pastes plain lines into the poem in one go, as a poet would paste a draft. */
async function pasteLines(page: Page, lines: readonly string[]) {
  await poem(page).evaluate((root, text) => {
    const data = new DataTransfer();
    data.setData('text/plain', text);
    const paste = new ClipboardEvent('paste', { bubbles: true, cancelable: true });
    Object.defineProperty(paste, 'clipboardData', { value: data });
    root.dispatchEvent(paste);
  }, lines.join('\n'));
}

async function switchCraft(page: Page) {
  await page.getByRole('button', { name: 'More tools' }).click();
  await page.getByRole('menuitemcheckbox', { name: 'Craft labels' }).click();
}

/** Puts the caret at the end of the last line, as a tap at the line end does on a phone. */
async function caretAtEnd(page: Page) {
  await poem(page).evaluate((root) => {
    const lines = root.querySelectorAll('[data-poem-line]');
    const last = lines[lines.length - 1];
    if (!last) return;
    (root as HTMLElement).focus();
    const range = document.createRange();
    range.selectNodeContents(last);
    range.collapse(false);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    last.scrollIntoView({ block: 'center' });
  });
  // Two frames, so any redraw after the scroll is done before the first key.
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            resolve();
          });
        });
      }),
  );
}

const poemText = (page: Page) => poem(page).evaluate((el) => (el as HTMLElement).innerText);

test('F19: syllables, stress and rhyme letters show for one poem, and the text stays the same', async ({
  page,
}) => {
  await newPoem(page);
  await pasteLines(page, QUATRAIN);
  await expect(poem(page)).toContainText('a date;');
  const before = await poemText(page);

  await switchCraft(page);
  await expect(page.getByRole('status').filter({ hasText: legend })).toBeVisible({ timeout: 20_000 });
  await expect(layer(page)).toHaveAttribute('data-lines', '4');
  const byLine = page.getByRole('list', { name: 'Craft labels by line' }).getByRole('listitem');
  await expect(byLine).toHaveText([
    'Line 1: 10 syllables, iambic, rhyme A',
    // The dictionary's first form of "temperate" has two syllables.
    /^Line 2: 9 syllables, .*rhyme B$/,
    /^Line 3: 10 syllables, .*rhyme A$/,
    /^Line 4: 10 syllables, .*rhyme C$/,
  ]);
  // The first line's marks, in order, and its count and letter at the line end.
  const marks = await layer(page)
    .locator('.vlo-craft-line')
    .first()
    .locator('.vlo-craft-mark')
    .allTextContents();
  expect(marks.join('')).toBe('˘/˘/˘/˘/˘/');
  await expect(layer(page).locator('.vlo-craft-end').first()).toHaveText('10A');
  expect(await poemText(page)).toBe(before);

  // The switch belongs to the poem and stays after a reload.
  await page.reload();
  await expect(page.getByRole('status').filter({ hasText: legend })).toBeVisible({ timeout: 20_000 });
  await expect(layer(page)).toHaveAttribute('data-lines', '4');
  expect(await poemText(page)).toBe(before);
  expect(await seriousIssues(page)).toEqual([]);

  await switchCraft(page);
  await expect(layer(page)).toHaveCount(0);
  expect(await poemText(page)).toBe(before);
});

test('a changed line hides its labels until the typing pause, then gets new ones', async ({ page }) => {
  await newPoem(page);
  await pasteLines(page, QUATRAIN);
  await switchCraft(page);
  await expect(layer(page)).toHaveAttribute('data-lines', '4', { timeout: 20_000 });
  await caretAtEnd(page);
  await page.keyboard.type(' and May');
  await expect(layer(page)).toHaveAttribute('data-lines', '3');
  await expect(layer(page)).toHaveAttribute('data-lines', '4');
  await expect(
    page.getByRole('list', { name: 'Craft labels by line' }).getByRole('listitem').last(),
  ).toHaveText(/^Line 4: 12 syllables, .*rhyme A$/);
});

test('Review Focus 6: a 300-line poem gets its labels within 200 ms of the scan, and typing never waits', async ({
  page,
  browserName,
}) => {
  test.skip(browserName !== 'chromium', 'The timing budget is measured on Chromium.');
  await newPoem(page);
  await pasteLines(page, Array.from({ length: 75 }, () => QUATRAIN).flat());
  await expect(poem(page).locator('[data-poem-line]')).toHaveCount(300);
  await switchCraft(page);
  await expect(layer(page)).toHaveAttribute('data-lines', '300', { timeout: 20_000 });

  // A new scan after a pause, with the dictionary already loaded.
  await page.evaluate(() => {
    performance.clearMarks('vlo-craft-scan');
    performance.clearMeasures('vlo-craft-labels');
  });
  await caretAtEnd(page);
  await page.evaluate(() => {
    // Keystroke to screen: from the key event until the next frame has done its rendering work.
    const delays: number[] = [];
    Object.assign(window, { __craftKeys: delays });
    window.addEventListener(
      'keydown',
      (event) => {
        if (event.key.length !== 1) return;
        const start = event.timeStamp;
        requestAnimationFrame(() => {
          const channel = new MessageChannel();
          channel.port1.onmessage = () => {
            delays.push(performance.now() - start);
          };
          channel.port2.postMessage(null);
        });
      },
      true,
    );
  });
  await page.keyboard.type(' and May', { delay: 40 });
  const typing = await page.evaluate(() => (window as unknown as { __craftKeys: number[] }).__craftKeys);
  console.log(`Craft labels on, 300 lines: key to screen ${typing.map((t) => t.toFixed(0)).join(', ')} ms`);
  expect(typing).toHaveLength(8);
  expect(Math.max(...typing)).toBeLessThan(50);
  await expect
    .poll(() => page.evaluate(() => performance.getEntriesByName('vlo-craft-labels').length), {
      timeout: 5_000,
    })
    .toBeGreaterThan(0);
  const took = await page.evaluate(
    () => performance.getEntriesByName('vlo-craft-labels').at(-1)?.duration ?? 0,
  );
  expect(took).toBeLessThan(200);
});

test('D2: the install leaves the pronouncing dictionary out', async ({ page }) => {
  await skipOnboarding(page);
  const worker = await page.evaluate(async () => (await fetch('/sw.js')).text());
  expect(worker).toContain('craft.worker');
  expect(worker).not.toContain('assets/craft/');
});

test('F56: a form check names what breaks the form, and the form stays with the poem', async ({ page }) => {
  await newPoem(page);
  await pasteLines(page, QUATRAIN);
  await switchCraft(page);
  const form = page.getByRole('combobox', { name: 'Form' });
  await expect(form).toBeVisible({ timeout: 20_000 });
  await form.selectOption('haiku');
  await expect(page.getByText('A haiku has 3 lines. This poem has 4.')).toBeVisible();

  await form.selectOption('pantoum');
  await expect(page.getByText('A pantoum has two or more stanzas of 4 lines.')).toBeVisible();
  await page.reload();
  await expect(page.getByRole('combobox', { name: 'Form' })).toHaveValue('pantoum', { timeout: 20_000 });
  expect(await seriousIssues(page)).toEqual([]);
});
