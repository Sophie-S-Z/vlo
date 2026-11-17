import { expect, test, type Page } from '@playwright/test';
import { seriousIssues } from './support/axe';
import { skipOnboarding, writeWithoutAccount } from './support/onboarding';
import { openView } from './support/views';
import { useTool } from './support/tools';

// A signed-out visit opens on the sign-in screen; these tests write with no account.
test.beforeEach(async ({ page }) => {
  await writeWithoutAccount(page);
});

/* Phase 19, Task D1: spelling and grammar on the device. grammar.test.ts holds the span mapping. */

const scene = (page: Page) => page.getByRole('textbox', { name: 'Scene 1' });
const note = (page: Page) => page.locator('[data-vlo-cursor-note]');

test('the check marks a typo and a grammar slip, fixes them, learns a word and knows a Codex name', async ({
  page,
  baseURL,
}) => {
  // The first check downloads Harper, about 8 MB.
  test.setTimeout(90_000);
  const origin = new URL(baseURL ?? '').origin;
  const away: string[] = [];
  page.on('request', (request) => {
    if (!request.url().startsWith(origin) && !request.url().startsWith('data:')) away.push(request.url());
  });

  await skipOnboarding(page);
  await page.getByRole('button', { name: 'New project' }).click();
  await page
    .getByRole('dialog', { name: 'New project' })
    .getByRole('button', { name: 'Create project' })
    .click();
  await expect(scene(page)).toBeFocused();
  await page.keyboard.type('I ate a apple with teh fork. Zorvath and Quellish waved.');
  await openView(page, 'Codex');
  await page.getByRole('textbox', { name: 'Name' }).fill('Zorvath');
  await page.getByRole('button', { name: 'Add entry' }).click();
  await expect(page.getByRole('heading', { level: 3, name: 'Zorvath' })).toBeVisible();
  await page.getByRole('navigation', { name: 'Project views' }).getByRole('link', { name: 'Write' }).click();

  // Off at first: the browser checks spelling.
  await expect(scene(page)).toHaveAttribute('spellcheck', 'true');
  await useTool(page, 'Spelling and grammar');
  await expect(scene(page)).toHaveAttribute('spellcheck', 'false');
  const spelling = scene(page).locator('.vlo-spelling');
  const grammar = scene(page).locator('.vlo-grammar');
  await expect(spelling).toHaveText(['teh', 'Quellish'], { timeout: 60_000 });
  await expect(grammar).toHaveText(['a']);
  expect(await seriousIssues(page)).toEqual([]);

  // A fix takes the place of the marked words.
  await spelling.first().click();
  await expect(note(page)).toContainText('Did you mean');
  await page.getByRole('button', { name: 'Change “teh” to “the”' }).click();
  await expect(scene(page)).toBeFocused();
  await grammar.first().click();
  await page.getByRole('button', { name: 'Change “a” to “an”' }).click();
  await expect(scene(page)).toHaveText('I ate an apple with the fork. Zorvath and Quellish waved.');
  await expect(spelling).toHaveText(['Quellish'], { timeout: 10_000 });
  await expect(grammar).toHaveCount(0);

  // A word in the dictionary loses its mark, and the dictionary lists it in Settings.
  await spelling.first().click();
  await page.getByRole('button', { name: 'Add to dictionary' }).click();
  await expect(spelling).toHaveCount(0);
  await page.getByRole('link', { name: 'Settings' }).click();
  await expect(page.getByRole('list', { name: 'Words in your dictionary' })).toHaveText('QuellishRemove');
  expect(away).toEqual([]);
});
