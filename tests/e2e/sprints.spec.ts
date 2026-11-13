import { expect, test, type Page } from '@playwright/test';
import { seriousIssues } from './support/axe';
import { skipOnboarding } from './support/onboarding';
import { openView } from './support/views';

/* Plan Task K7 (roadmap F60, Review Focus 5): sprints, the sprint room and the month challenge. */

// Playwright routes the fake Supabase requests only in Chromium once the service worker controls the
// page, so these tests run with no service worker, as a11y.spec.ts does.
test.use({ serviceWorkers: 'block' });

const RPC = 'https://vlo-test.supabase.co/rest/v1/rpc/';

async function newNovel(page: Page) {
  await skipOnboarding(page);
  await page.getByRole('button', { name: 'New project' }).click();
  await page
    .getByRole('dialog', { name: 'New project' })
    .getByRole('button', { name: 'Create project' })
    .click();
  await expect(page.getByRole('textbox', { name: 'Scene 1' })).toBeFocused();
}

async function startSprint(page: Page, target: string, friends?: { nickname: string }) {
  await page.getByRole('button', { name: 'Timer' }).click();
  await page.getByRole('menuitem', { name: 'Start a sprint' }).click();
  const dialog = page.getByRole('dialog', { name: 'Start a sprint' });
  await dialog.getByRole('group', { name: 'Minutes' }).getByRole('button', { name: '10' }).click();
  await dialog.getByLabel('Word target').fill(target);
  if (friends) {
    await dialog.getByRole('switch', { name: 'Sprint with friends' }).click();
    await dialog.getByLabel('Nickname').fill(friends.nickname);
  }
  expect(await seriousIssues(page)).toEqual([]);
  await dialog.getByRole('button', { name: 'Start the sprint' }).click();
  await expect(dialog).toBeHidden();
  // The focus goes back to the timer, as after "Write for 10 minutes". The writer goes back to the text.
  await page.getByRole('textbox', { name: 'Scene 1' }).click();
  await page.keyboard.press(`${process.platform === 'darwin' ? 'Meta' : 'Control'}+End`);
}

async function endSprint(page: Page) {
  await page.getByRole('button', { name: /Session timer/ }).click();
  await page.getByRole('menuitem', { name: 'End the sprint' }).click();
}

test('a sprint counts only its own words and shows the result', async ({ page }) => {
  await newNovel(page);
  await page.keyboard.type('Before the sprint. ');
  await expect(page.getByRole('status').filter({ hasText: /Saved/ })).toHaveText('Saved');
  await startSprint(page, '4');
  await page.keyboard.type('The tide came in fast.');
  await expect(page.getByRole('status').filter({ hasText: /Saved/ })).toHaveText('Saved');
  await endSprint(page);

  const result = page.getByRole('dialog', { name: 'Sprint result' });
  await expect(result).toContainText('You reached your target.');
  await expect(result.getByTestId('sprint-words')).toHaveText('5 of 4 words in 10 minutes');
  expect(await seriousIssues(page)).toEqual([]);
  await result.getByRole('button', { name: 'Done' }).click();
  await expect(page.getByRole('button', { name: 'Timer' })).toBeFocused();
});

test('a sprint with no time limit ends at its target, and the timer shows the words so far', async ({
  page,
}) => {
  await newNovel(page);
  await page.getByRole('button', { name: 'Timer' }).click();
  await page.getByRole('menuitem', { name: 'Start a sprint' }).click();
  const dialog = page.getByRole('dialog', { name: 'Start a sprint' });
  await dialog.getByRole('group', { name: 'Minutes' }).getByRole('button', { name: 'No limit' }).click();
  await dialog.getByLabel('Word target').fill('4');
  await dialog.getByRole('button', { name: 'Start the sprint' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole('button', { name: /^Stopwatch, / })).toHaveAccessibleName(
    /^Stopwatch, 0:0\d so far, 0 of 4 words$/,
  );
  await page.getByRole('textbox', { name: 'Scene 1' }).click();
  await page.keyboard.type('The tide came in.');

  const prompt = page.getByRole('alertdialog', { name: 'You reached your target' });
  await expect(prompt).toContainText('You wrote 4 of 4 words.');
  expect(await seriousIssues(page)).toEqual([]);
  await prompt.getByRole('button', { name: 'End the sprint' }).click();
  const result = page.getByRole('dialog', { name: 'Sprint result' });
  await expect(result.getByTestId('sprint-words')).toHaveText('4 of 4 words in 1 minute');
});

test('a sprint room gets only the code, a member id, the nickname and the count', async ({ page }) => {
  const calls: { name: string; body: Record<string, unknown> }[] = [];
  await page.route(`${RPC}*`, async (route) => {
    const name = new URL(route.request().url()).pathname.split('/').at(-1) ?? '';
    const body = route.request().postDataJSON() as Record<string, unknown>;
    calls.push({ name, body });
    const mine = { nickname: 'Ana', words: Number(body.p_words ?? 0), mine: true };
    const value =
      name === 'room_create'
        ? 'KXMQRT'
        : [{ nickname: 'Ben', words: 40, mine: false }, mine].sort((a, b) => b.words - a.words);
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(value) });
  });
  await newNovel(page);
  await startSprint(page, '100', { nickname: 'Ana' });

  await page.keyboard.type('Salt on the window.');
  await page.getByRole('button', { name: 'Room KXMQRT' }).click();
  const panel = page.getByRole('dialog').filter({ hasText: 'Room KXMQRT' });
  await expect(panel.getByRole('listitem')).toHaveText(['Ben40', 'Ana (you)0']);
  expect(await seriousIssues(page)).toEqual([]);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('status').filter({ hasText: /Saved/ })).toHaveText('Saved');
  await endSprint(page);

  const result = page.getByRole('dialog', { name: 'Sprint result' });
  await expect(result.getByRole('listitem')).toHaveText(['Ben40', 'Ana (you)4']);
  const member = calls[1]?.body.p_member;
  expect(member).toMatch(/^[A-Za-z0-9_-]{22}$/);
  expect(calls[0]).toEqual({ name: 'room_create', body: {} });
  expect(calls[1]).toEqual({
    name: 'room_join',
    body: { p_code: 'KXMQRT', p_member: member, p_nickname: 'Ana' },
  });
  for (const { name, body } of calls.slice(2)) {
    expect(name).toBe('room_post');
    expect(body).toEqual({ p_code: 'KXMQRT', p_member: member, p_words: body.p_words });
    expect(Number.isInteger(body.p_words)).toBe(true);
  }
  expect(calls.at(-1)?.body.p_words).toBe(4);
  expect(JSON.stringify(calls)).not.toMatch(/Salt|window|Untitled/);
});

test('a month challenge shows the words of each day of the month', async ({ page }) => {
  await newNovel(page);
  await page.keyboard.type('One two three four five six.');
  await expect(page.getByRole('status').filter({ hasText: /Saved/ })).toHaveText('Saved');
  await openView(page, 'Progress');

  const section = page.getByRole('region', { name: 'Month challenge' });
  await section.getByLabel('Words this month').fill('1000');
  await section.getByRole('button', { name: 'Start a month challenge' }).click();
  await expect(section).toContainText(/^Month challenge6 of 1,000 words in \w+ \d{4}\. Write /);
  const today = section.locator('td[aria-current="date"]');
  await expect(today).toContainText('6');
  expect(await seriousIssues(page)).toEqual([]);
  await section.getByRole('button', { name: 'End the challenge' }).click();
  await expect(section.getByRole('button', { name: 'Start a month challenge' })).toBeVisible();
});

test('the command menu opens the sprint dialog', async ({ page }) => {
  await newNovel(page);
  await page.keyboard.press(`${process.platform === 'darwin' ? 'Meta' : 'Control'}+k`);
  await page.getByRole('combobox').fill('sprint');
  await page.getByRole('option', { name: 'Start a sprint…' }).click();
  await expect(page.getByRole('dialog', { name: 'Start a sprint' })).toBeVisible();
});
