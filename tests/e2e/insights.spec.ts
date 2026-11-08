import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { seriousIssues } from './support/axe';
import { skipOnboarding } from './support/onboarding';
import { editorSelection } from './support/selection';

/*
 * Insights: the stats bar under the text, the full statistics, the AI check and the originality check.
 */

const AI_ESSAY = readFileSync('scripts/ai-detector-data/newer-model/test/14.txt', 'utf8').trim();
const text = (page: Page) => page.getByRole('textbox', { name: 'Scene 1' });
const bar = (page: Page) => page.getByRole('group', { name: 'Writing statistics' });
const insights = (page: Page) => page.getByRole('dialog', { name: 'Insights' });

async function newNovel(page: Page, words: string) {
  await skipOnboarding(page);
  await page.getByRole('button', { name: 'New project' }).click();
  await page
    .getByRole('dialog', { name: 'New project' })
    .getByRole('button', { name: 'Create project' })
    .click();
  await expect(text(page)).toBeFocused();
  await page.keyboard.insertText(words);
  await expect(text(page)).toContainText(words.slice(0, 40));
  // The word count rolls in after the save, so the checks below start once it is still.
  await expect(page.getByRole('status').filter({ hasText: /Saved/ })).toHaveText('Saved');
}

test('the stats bar counts after a pause and can be changed or hidden', async ({ page }) => {
  await newNovel(page, 'The cat sat on the mat. It was a sunny day.');
  await expect(bar(page)).toContainText('11 words');
  await expect(bar(page)).toContainText('2 sentences');
  await page.keyboard.insertText(' The dog came home.');
  await expect(bar(page)).toContainText('15 words');

  await bar(page).getByRole('button', { name: 'Choose the counts in the stats bar' }).click();
  await page.getByRole('checkbox', { name: 'Pages' }).check();
  await expect(bar(page)).toContainText('page');
  await page.getByRole('switch', { name: 'Show the stats bar' }).click();
  await expect(bar(page)).toHaveCount(0);

  // Insights turns it back on.
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Insights' }).click();
  await insights(page).getByRole('switch', { name: 'Show the stats bar under the text' }).click();
  await page.keyboard.press('Escape');
  await expect(bar(page)).toContainText('15 words');
});

test('Insights shows the statistics, the keywords and the AI check, and shows a passage in the text', async ({
  page,
}) => {
  await newNovel(page, AI_ESSAY);
  await page.getByRole('button', { name: 'Insights' }).click();
  const dialog = insights(page);
  await expect(dialog.getByRole('heading', { name: 'Readability' })).toBeVisible();
  await expect(dialog.getByText('Flesch reading ease')).toBeVisible();
  expect(await seriousIssues(page)).toEqual([]);

  await dialog.getByRole('tab', { name: 'Keywords' }).click();
  await expect(dialog.getByRole('table', { name: 'Words' })).toContainText('ai');

  await dialog.getByRole('tab', { name: 'AI check' }).click();
  await dialog.getByRole('button', { name: 'Check this item' }).click();
  // The status says "Vlo could not run the check" when the worker fails, so a failure names the cause.
  await expect(dialog.getByRole('status').filter({ hasText: /check/ })).toHaveText('The check is done.');
  await expect(dialog.getByText('Many signs of AI writing')).toBeVisible();
  await expect(dialog.getByText('No text in this item came from')).toBeVisible();
  await expect(dialog.getByText('Phrases that AI models overuse')).toBeVisible();
  expect(await seriousIssues(page)).toEqual([]);

  await dialog.getByRole('button', { name: 'Show in the text' }).first().click();
  await expect(dialog).toBeHidden();
  const selected = await editorSelection(text(page));
  expect(selected.text.length).toBeGreaterThan(20);
  expect(AI_ESSAY).toContain(selected.text.slice(0, 20));
});

test('the originality check finds a pasted source on the device and a web page on request', async ({
  page,
}) => {
  const copied =
    'The migration of monarch butterflies covers thousands of miles across North America every autumn.';
  await newNovel(page, `I wrote this part myself. ${copied} And this ending is mine too.`);
  await page.getByRole('button', { name: 'Insights' }).click();
  const dialog = insights(page);
  await dialog.getByRole('tab', { name: 'Originality' }).click();

  await dialog.getByText('Your sources (0)').click();
  await dialog.getByRole('textbox', { name: 'Title' }).fill('Butterfly article');
  await dialog.getByRole('textbox', { name: 'Text', exact: true }).fill(`Intro text. ${copied} More text.`);
  await dialog.getByRole('button', { name: 'Add the source' }).click();
  await expect(dialog.getByText('Your sources (1)')).toBeVisible();

  await dialog.getByRole('button', { name: 'Check on this device' }).click();
  await expect(dialog.getByText(/similar$/)).toBeVisible();
  await expect(dialog.getByText('Copied, 14 words')).toBeVisible();
  await expect(dialog.getByRole('listitem').filter({ hasText: 'Butterfly article' }).first()).toBeVisible();

  // The web check: Wikipedia and OpenAlex answer from here, so the test never leaves the machine.
  const asked: string[] = [];
  await page.route('https://en.wikipedia.org/**', async (route) => {
    const url = route.request().url();
    asked.push(url);
    const body = url.includes('list=search')
      ? { query: { search: [{ title: 'Monarch butterfly' }] } }
      : {
          query: {
            pages: [{ title: 'Monarch butterfly', extract: `Facts. I wrote this part myself. ${copied}` }],
          },
        };
    await route.fulfill({ json: body, headers: { 'access-control-allow-origin': '*' } });
  });
  await page.route('https://api.openalex.org/**', async (route) => {
    asked.push(route.request().url());
    await route.fulfill({ json: { results: [] }, headers: { 'access-control-allow-origin': '*' } });
  });
  await dialog.getByRole('button', { name: 'Check the web too' }).click();
  await expect(dialog.getByRole('link', { name: 'Monarch butterfly (Wikipedia)' })).toBeVisible();
  await expect(dialog.getByText(/Vlo sent \d short phrases? in \d+ requests/)).toBeVisible();
  expect(asked.length).toBeGreaterThan(0);
  for (const url of asked) expect(url).not.toContain('And%20this%20ending');
  expect(await seriousIssues(page)).toEqual([]);
});

test('the deep check waits for Reader mode, names its model and says when the browser has no WebGPU', async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(Navigator.prototype, 'gpu', { configurable: true, get: () => undefined });
  });
  await newNovel(page, AI_ESSAY);
  await page.getByRole('button', { name: 'Insights' }).click();
  const dialog = insights(page);
  await dialog.getByRole('tab', { name: 'AI check' }).click();
  // Pen mode loads no AI code (decision of 2026-11-08), so the deep check asks for another mode.
  await expect(dialog.getByText('it works only in Reader or Co-writer mode')).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Run the deep check' })).toHaveCount(0);
  await page.keyboard.press('Escape');

  await page.getByRole('button', { name: /^AI mode: / }).click();
  const mode = page.getByRole('dialog', { name: 'AI mode' });
  await mode.getByRole('radio', { name: /^Reader/ }).click();
  await mode.getByRole('button', { name: 'Switch to Reader mode' }).click();
  await expect(page.getByRole('button', { name: /^AI mode: / })).toHaveAccessibleName('AI mode: Reader');
  await page.getByRole('button', { name: 'Insights' }).click();
  await dialog.getByRole('tab', { name: 'AI check' }).click();
  await expect(dialog.getByRole('heading', { name: 'Deep check, with a language model' })).toBeVisible();
  await expect(dialog.getByRole('combobox', { name: 'Model' })).toHaveValue(/Qwen2\.5-1\.5B/);
  expect(await seriousIssues(page)).toEqual([]);
  await dialog.getByRole('button', { name: 'Run the deep check' }).click();
  await expect(dialog.getByRole('status').filter({ hasText: 'no WebGPU' })).toBeVisible();

  // The AI tab stays mounted, so its state lasts while the writer looks at another tab.
  await dialog.getByRole('tab', { name: 'Stats' }).click();
  await dialog.getByRole('tab', { name: 'AI check' }).click();
  await expect(dialog.getByRole('status').filter({ hasText: 'no WebGPU' })).toBeVisible();
});
