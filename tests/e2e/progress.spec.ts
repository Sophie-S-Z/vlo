import { expect, test, type Page } from '@playwright/test';
import { seriousIssues } from './support/axe';
import { skipOnboarding } from './support/onboarding';
import { openView } from './support/views';

/*
 * Plan Task C9: Progress (spec 8.4, F21). The total words and sessions count up, the map has one tile per
 * item by status, and the daily goal and streak are off until the writer turns them on.
 */

const DAY_NAME = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const tiles = (page: Page) => page.getByRole('list', { name: 'Items by status' }).getByRole('listitem');

/** A new novel whose Scene 1 holds five words, on its Progress screen. */
async function novelWithWords(page: Page) {
  await skipOnboarding(page);
  await page.getByRole('button', { name: 'New project' }).click();
  const dialog = page.getByRole('dialog', { name: 'New project' });
  await dialog.getByRole('checkbox', { name: /Novel/ }).click();
  await dialog.getByRole('button', { name: 'Create project' }).click();
  const scene = page.getByRole('textbox', { name: 'Scene 1' });
  await expect(scene).toBeFocused();
  await page.keyboard.type('Mira found the wet ledger');
  await expect(page.getByText('5 words', { exact: true })).toBeVisible();
  await openProgress(page);
}

async function openProgress(page: Page) {
  await openView(page, 'Progress');
  await expect(page.getByRole('heading', { level: 2, name: 'Map' })).toBeVisible();
}

/** Adds words to the days before today, by days back, straight into the stored project. */
async function seedDays(page: Page, back: Record<number, number>) {
  await page.evaluate(
    async (entries) => {
      const key = (d: Date) =>
        `${String(d.getFullYear())}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      await new Promise<void>((resolve, reject) => {
        const open = indexedDB.open('vlo');
        open.onerror = () => {
          reject(open.error ?? new Error('open failed'));
        };
        open.onsuccess = () => {
          const db = open.result;
          const tx = db.transaction('projects', 'readwrite');
          const store = tx.objectStore('projects');
          const all = store.getAll();
          all.onsuccess = () => {
            for (const project of all.result as { settings: { wordsByDay?: Record<string, number> } }[]) {
              const byDay = { ...project.settings.wordsByDay };
              for (const [daysBack, words] of entries) {
                const day = new Date();
                day.setDate(day.getDate() - daysBack);
                byDay[key(day)] = words;
              }
              project.settings.wordsByDay = byDay;
              store.put(project);
            }
          };
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onerror = () => {
            reject(tx.error ?? new Error('write failed'));
          };
        };
      });
    },
    Object.entries(back).map(([d, w]) => [Number(d), w] as [number, number]),
  );
  await page.reload();
  await expect(page.getByRole('heading', { level: 2, name: 'Map' })).toBeVisible();
}

test('F21: the totals count up, and the map has one tile per item that opens it', async ({ page }) => {
  await novelWithWords(page);
  // A novel has 5 tabs. On a phone the row scrolls to show the tab of this screen.
  await expect(
    page.getByRole('navigation', { name: 'Project views' }).getByRole('link', { name: 'Progress' }),
  ).toBeInViewport({ ratio: 0.95 });
  const totals = page.getByTestId('progress-totals');
  await expect(totals.locator('[data-count-up="5"]')).toHaveText('5');
  await expect(totals.locator('[data-count-up="0"]')).toHaveText('0');
  await expect(totals).toContainText('words in all');
  await expect(totals).toContainText('writing sessions with the timer');

  // Binder order, each tile named with its kind, status and words.
  await expect(tiles(page)).toHaveCount(2);
  await expect(tiles(page).first().getByRole('link')).toHaveAccessibleName(
    'Chapter 1, chapter, draft, 0 words',
  );
  await expect(tiles(page).last().getByRole('link')).toHaveAccessibleName('Scene 1, scene, draft, 5 words');
  await expect(page.getByRole('list', { name: 'Status key' })).toContainText('Draft 2');
  expect(await seriousIssues(page)).toEqual([]);

  // A chapter tile opens its first scene.
  await tiles(page).first().getByRole('link').click();
  await expect(page.getByRole('heading', { level: 2, name: 'Scene 1' })).toBeVisible();
});

test('F21: goals are off by default, and a rest day keeps the streak', async ({ page }) => {
  await novelWithWords(page);
  await expect(page.getByText('Off until you want it.', { exact: false })).toBeVisible();
  await expect(page.getByTestId('goal-streak')).toHaveCount(0);

  // Yesterday met the goal, the day before is empty, and the day before that met it.
  await seedDays(page, { 1: 600, 3: 700 });
  await page.getByRole('switch', { name: 'Track a daily goal and streak' }).click();
  await expect(page.getByTestId('goal-today')).toContainText('5 of 500 words today');
  await expect(page.getByTestId('goal-streak')).toHaveText('Streak: 1 day. Best: 1 day.');
  await expect(page.getByTestId('goal-calendar')).toHaveAttribute(
    'aria-label',
    'The last 4 weeks: goal met on 2 days, with 0 days of rest.',
  );

  const twoDaysAgo = new Date();
  twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);
  await page.getByRole('checkbox', { name: DAY_NAME[twoDaysAgo.getDay()] ?? '' }).check();
  await expect(page.getByTestId('goal-streak')).toHaveText('Streak: 2 days. Best: 2 days.');

  // A goal the writer has already reached counts today too.
  const goal = page.getByLabel('Words a day');
  await goal.fill('0');
  await goal.press('Enter');
  await expect(page.getByRole('alert')).toHaveText('Type a goal from 1 to 100,000 words.');
  await goal.fill('5');
  await goal.press('Enter');
  await expect(page.getByText('Type a goal from')).toHaveCount(0);
  await expect(page.getByTestId('goal-today')).toContainText('Goal met.');
  await expect(page.getByTestId('goal-streak')).toHaveText('Streak: 3 days. Best: 3 days.');

  await page.reload();
  await expect(page.getByTestId('goal-streak')).toHaveText('Streak: 3 days. Best: 3 days.');
  await expect(page.getByLabel('Words a day')).toHaveValue('5');
  expect(await seriousIssues(page)).toEqual([]);

  await page.getByRole('switch', { name: 'Track a daily goal and streak' }).click();
  await expect(page.getByTestId('goal-streak')).toHaveCount(0);
});

test('F46: a deadline sets the daily goal from the words and the writing days left', async ({ page }) => {
  await novelWithWords(page);
  await page.getByRole('switch', { name: 'Track a daily goal and streak' }).click();
  const end = new Date();
  end.setDate(end.getDate() + 9);
  const date = `${String(end.getFullYear())}-${String(end.getMonth() + 1).padStart(2, '0')}-${String(end.getDate()).padStart(2, '0')}`;
  await page.getByLabel('Finish by').fill(date);
  await page.getByLabel('Words in all by then').fill('1000');
  await page.getByRole('button', { name: 'Set a deadline' }).click();
  // 1,000 words over today and the 9 days after it. The 5 words of today count for today.
  await expect(page.getByTestId('deadline')).toContainText(
    '995 words left: 100 words a day over 10 writing days.',
  );
  await expect(page.getByTestId('goal-today')).toContainText('5 of 100 words today');
  await expect(page.getByLabel('Words a day')).toBeHidden();
  expect(await seriousIssues(page)).toEqual([]);

  await page.reload();
  await expect(page.getByTestId('goal-today')).toContainText('5 of 100 words today');
  await page.getByRole('button', { name: 'Remove the deadline' }).click();
  await expect(page.getByTestId('goal-today')).toContainText('5 of 500 words today');
});

test('a target under the words of the project sets a goal to cut, and the writing screen shows it', async ({
  page,
}) => {
  await novelWithWords(page);
  await page.getByRole('switch', { name: 'Track a daily goal and streak' }).click();
  const end = new Date();
  end.setDate(end.getDate() + 9);
  const date = `${String(end.getFullYear())}-${String(end.getMonth() + 1).padStart(2, '0')}-${String(end.getDate()).padStart(2, '0')}`;
  await page.getByLabel('Finish by').fill(date);
  await page.getByLabel('Words in all by then').fill('3');
  await expect(page.getByLabel('Words in all by then')).toHaveAccessibleDescription(
    'The project has 5 words now. This target sets a goal to cut the draft down.',
  );
  await page.getByRole('button', { name: 'Set a goal to cut' }).click();
  // 2 words to remove over today and the 9 days after it.
  await expect(page.getByTestId('deadline')).toContainText(
    '2 words to cut: 1 word a day over 10 writing days.',
  );
  await expect(page.getByTestId('deadline-progress')).toHaveText('0 of 2 words cut, 0%');
  await expect(page.getByTestId('goal-today')).toContainText('0 of 1 words cut today');
  expect(await seriousIssues(page)).toEqual([]);

  // The writing screen shows today's goal, and a cut word fills it.
  await page.getByRole('navigation', { name: 'Project views' }).getByRole('link', { name: 'Write' }).click();
  const chip = page.getByTestId('goal-chip');
  await expect(chip).toHaveAccessibleName('Today’s goal: 0 of 1 words cut');
  const scene = page.getByRole('textbox', { name: 'Scene 1' });
  await scene.click();
  await page.keyboard.press('End');
  await page.keyboard.press('Control+Backspace');
  await expect(page.getByText('4 words', { exact: true })).toBeVisible();
  await expect(chip).toHaveAccessibleName('Today’s goal: 1 of 1 words cut. Goal met.');
  await chip.click();
  await expect(page.getByTestId('deadline-progress')).toHaveText('1 of 2 words cut, 50%');
});

test('the writing screen shows no goal until the writer turns goals on', async ({ page }) => {
  await novelWithWords(page);
  await page.getByRole('navigation', { name: 'Project views' }).getByRole('link', { name: 'Write' }).click();
  await expect(page.getByRole('textbox', { name: 'Scene 1' })).toBeVisible();
  await expect(page.getByTestId('goal-chip')).toHaveCount(0);
});

test('the tiles enter as a mosaic, and Calm mode shows them at once', async ({ page }) => {
  await novelWithWords(page);
  await page.reload();
  await expect(tiles(page)).toHaveCount(2);
  const moving = await page.evaluate(() => document.getAnimations().length);
  expect(moving).toBeGreaterThan(0);

  await page.evaluate(() => {
    localStorage.setItem('vlo:preferences', JSON.stringify({ theme: 'system', calm: true }));
  });
  await page.reload();
  await expect(tiles(page)).toHaveCount(2);
  expect(await page.evaluate(() => document.getAnimations().length)).toBe(0);
  await expect(page.getByTestId('progress-totals').locator('[data-count-up="5"]')).toHaveText('5');
});

test('Progress has a tab on every template and a command', async ({ page }) => {
  await skipOnboarding(page);
  for (const template of [/Memoir/, /Poetry/]) {
    await page.goto('/');
    await page.getByRole('button', { name: 'New project' }).click();
    const dialog = page.getByRole('dialog', { name: 'New project' });
    await dialog.getByRole('checkbox', { name: template }).click();
    await dialog.getByRole('button', { name: 'Create project' }).click();
    await expect(page.getByRole('navigation', { name: 'Project views' }).getByRole('link').last()).toHaveText(
      'Progress',
    );
  }
  await page.keyboard.press('ControlOrMeta+k');
  const menu = page.getByRole('dialog', { name: 'Command menu' });
  await menu.getByRole('combobox').fill('Open Progress');
  await menu.getByRole('option', { name: 'Open Progress' }).click();
  await expect(page.getByRole('heading', { level: 2, name: 'Map' })).toBeVisible();
  await expect(tiles(page)).toHaveCount(1);
  expect(await seriousIssues(page)).toEqual([]);
});
