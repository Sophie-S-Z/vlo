import { expect, test, type Page } from '@playwright/test';
import { seriousIssues } from './support/axe';
import { skipOnboarding, writeWithoutAccount } from './support/onboarding';
import { openView } from './support/views';
import { useTool } from './support/tools';

// A signed-out visit opens on the sign-in screen; these tests write with no account.
test.beforeEach(async ({ page }) => {
  await writeWithoutAccount(page);
});

/* Phase 19, Task D2: the thesaurus and the rhymes. thesaurus.test.tsx holds the word lists. */

async function newProject(page: Page, mode?: RegExp) {
  await skipOnboarding(page);
  await page.getByRole('button', { name: 'New project' }).click();
  const dialog = page.getByRole('dialog', { name: 'New project' });
  if (mode) await dialog.getByRole('checkbox', { name: mode }).click();
  await dialog.getByRole('button', { name: 'Create project' }).click();
}

/** Collects each request that the page makes from now on. */
function requests(page: Page): string[] {
  const made: string[] = [];
  page.on('request', (request) => {
    if (!request.url().startsWith('data:')) made.push(request.url());
  });
  return made;
}

test('Shift-F7 opens the thesaurus at the word, and a click replaces it', async ({ page, baseURL }) => {
  await newProject(page);
  const scene = page.getByRole('textbox', { name: 'Scene 1' });
  await expect(scene).toBeFocused();
  await page.keyboard.type('A bright morning.');
  await expect(scene).toHaveText('A bright morning.');
  // The caret goes back into "bright".
  for (let i = 0; i < 12; i += 1) await page.keyboard.press('ArrowLeft');

  const all = requests(page);
  await page.keyboard.press('Shift+F7');
  const card = page.getByRole('dialog', { name: 'Thesaurus' });
  await expect(card.getByRole('searchbox', { name: 'Word' })).toHaveValue('bright');
  const light = card.getByRole('list', {
    name: 'Words that mean: emitting or reflecting light readily or in large amounts',
  });
  await expect(light.getByRole('button', { name: 'brilliant', exact: true })).toBeVisible({
    timeout: 30_000,
  });
  // The first look-up loads Vlo's own files only.
  const origin = new URL(baseURL ?? '').origin;
  expect(all.filter((url) => !url.startsWith(origin))).toEqual([]);
  expect(await seriousIssues(page)).toEqual([]);

  // After the first load, a look-up makes no request for the word data.
  const later = requests(page);
  await card.getByRole('searchbox', { name: 'Word' }).fill('happy');
  await page.keyboard.press('Enter');
  await expect(card.getByRole('button', { name: 'glad', exact: true }).first()).toBeVisible();
  await card.getByRole('searchbox', { name: 'Word' }).fill('bright');
  await page.keyboard.press('Enter');
  await light.getByRole('button', { name: 'brilliant', exact: true }).click();
  await expect(card).toBeHidden();
  await expect(scene).toBeFocused();
  await expect(scene).toHaveText('A brilliant morning.');
  // The app may load its own code as the writer types, such as the daily count, but no word data again.
  expect(later.filter((url) => !url.startsWith(origin) || /thesaurus|craft/.test(url))).toEqual([]);

  // Review > Thesaurus opens the same card.
  await useTool(page, 'Thesaurus');
  await expect(card.getByRole('searchbox', { name: 'Word' })).toBeVisible();
});

test('a poem gets rhymes in the card and in the Workshop', async ({ page }) => {
  await newProject(page, /Poetry/);
  const poem = page.getByRole('textbox', { name: 'Poem 1' });
  await expect(poem).toBeFocused();
  await page.keyboard.type('the light');
  await useTool(page, 'Thesaurus');
  const card = page.getByRole('dialog', { name: 'Thesaurus' });
  await card.getByRole('button', { name: 'Rhymes', exact: true }).click();
  await expect(card.getByText(/\bnight\b/)).toBeVisible({ timeout: 30_000 });
  await page.keyboard.press('Escape');

  await openView(page, 'Workshop');
  await page.getByRole('group', { name: 'Workshop tool' }).getByRole('button', { name: 'Rhymes' }).click();
  await page.getByLabel('Word to rhyme').fill('moon');
  await page.getByRole('button', { name: 'Find rhymes' }).click();
  await expect(page.getByRole('heading', { name: 'Rhymes', exact: true }).locator('xpath=..')).toContainText(
    'tune',
  );
  await page.getByRole('switch', { name: 'Only words of 1 syllable' }).click();
  await expect(page.getByText('balloon')).toHaveCount(0);
  expect(await seriousIssues(page)).toEqual([]);
});
