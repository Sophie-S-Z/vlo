import { expect, test, type Page } from '@playwright/test';
import { seriousIssues } from './support/axe';
import { skipOnboarding } from './support/onboarding';

const binder = (page: Page) => page.getByRole('navigation', { name: 'Binder' });
const scene = (page: Page, n: number) => page.getByRole('textbox', { name: `Scene ${String(n)}` });
const mod = process.platform === 'darwin' ? 'Meta' : 'Control';

async function newNovel(page: Page) {
  await skipOnboarding(page);
  await page.getByRole('button', { name: 'New project' }).click();
  await page
    .getByRole('dialog', { name: 'New project' })
    .getByRole('button', { name: 'Create project' })
    .click();
  await expect(scene(page, 1)).toBeFocused();
}

test.describe('wide screens', () => {
  test.skip(({ isMobile }) => isMobile, 'The binder is a drawer under 600 px.');

  test('focus mode hides the binder, the details and the site header, and Escape leaves it', async ({
    page,
  }) => {
    await newNovel(page);
    await page.getByRole('button', { name: 'Show details' }).click();
    await page.getByRole('button', { name: 'Focus', exact: true }).click();
    await page.getByRole('menuitem', { name: 'Enter focus mode' }).click();
    await expect(binder(page)).toBeHidden();
    await expect(page.getByRole('complementary', { name: 'Details' })).toBeHidden();
    await expect(page.getByRole('navigation', { name: 'Main' })).toBeHidden();
    await expect(scene(page, 1)).toBeVisible();
    await expect(scene(page, 1)).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(binder(page)).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Main' })).toBeVisible();
  });

  test('Mod-K finds an item by title and by a phrase in its text', async ({ page }) => {
    await newNovel(page);
    await binder(page).getByRole('button', { name: 'Options for Chapter 1' }).click();
    await page.getByRole('menuitem', { name: 'Add Scene inside' }).click();
    await expect(scene(page, 2)).toBeFocused();
    await page.keyboard.type('The kettle sings on the stove.');
    await expect(page.getByRole('status').filter({ hasText: 'Saved' })).toHaveText('Saved');
    await binder(page).getByRole('button', { name: 'Scene 1', exact: true }).click();
    await expect(scene(page, 1)).toBeVisible();

    await page.keyboard.press(`${mod}+k`);
    const menu = page.getByRole('dialog', { name: 'Command menu' });
    await menu.getByRole('combobox').fill('Scene 2');
    await expect(menu.getByRole('option', { name: 'Scene 2' }).first()).toBeVisible();
    await page.keyboard.press('Enter');
    await expect(menu).toBeHidden();
    await expect(scene(page, 2)).toBeVisible();

    await binder(page).getByRole('button', { name: 'Scene 1', exact: true }).click();
    await expect(scene(page, 1)).toBeVisible();
    await scene(page, 1).click();
    await page.keyboard.press(`${mod}+k`);
    await menu.getByRole('combobox').fill('kettle sings');
    const hit = menu.getByRole('group', { name: 'Text' }).getByRole('option');
    await expect(hit).toHaveCount(1);
    await expect(hit).toContainText('The kettle sings on the stove.');
    await page.keyboard.press('Enter');
    await expect(scene(page, 2)).toBeVisible();
  });

  test('the command menu lists only items that open, finds near misses and stays shut over a dialog', async ({
    page,
  }) => {
    await newNovel(page);
    await page.keyboard.type('The kettle sings on the stove.');
    await expect(page.getByRole('status').filter({ hasText: 'Saved' })).toHaveText('Saved');

    await page.keyboard.press(`${mod}+k`);
    const menu = page.getByRole('dialog', { name: 'Command menu' });
    await menu.getByRole('combobox').fill('Chapter');
    await expect(menu.getByText('Nothing matches.')).toBeVisible();
    await expect(menu.getByRole('option', { name: 'Chapter 1' })).toHaveCount(0);

    // A misspelt word still finds the scene, and the snippet shows the word it matched.
    await menu.getByRole('combobox').fill('ketle');
    await expect(menu.getByRole('group', { name: 'Text' }).getByRole('option')).toContainText(
      'The kettle sings on the stove.',
    );
    await page.keyboard.press('Escape');
    await expect(menu).toBeHidden();

    await page.getByRole('button', { name: 'History' }).click();
    const history = page.getByRole('dialog', { name: 'History' });
    await expect(history).toBeVisible();
    await page.keyboard.press(`${mod}+k`);
    await expect(menu).toBeHidden();
    await expect(history).toBeVisible();
  });
});

test('the session timer ends with a gentle prompt and no penalty', async ({ page }) => {
  await page.clock.install();
  await newNovel(page);
  await page.keyboard.type('Rain on the ledger.');
  await page.getByRole('button', { name: 'Timer' }).click();
  await page.getByRole('menuitem', { name: 'Write for 10 minutes' }).click();
  await expect(page.getByRole('button', { name: 'Session timer, 10:00 left' })).toBeVisible();
  await page.clock.fastForward('05:00');
  await expect(page.getByRole('button', { name: 'Session timer, 5:00 left' })).toBeVisible();
  await page.clock.fastForward('05:01');

  const prompt = page.getByRole('alertdialog', { name: 'Close the session?' });
  await expect(prompt).toBeVisible();
  await expect(prompt.getByRole('button', { name: 'Keep writing' })).toBeVisible();
  await expect(prompt).not.toContainText(/penalt|streak|lost|fail|missed/i);
  await prompt.getByRole('button', { name: 'Keep writing' }).click();
  await expect(prompt).toBeHidden();
  await page.clock.fastForward('01:00');
  await expect(prompt).toBeHidden();

  await page.getByRole('button', { name: 'Session open' }).click();
  await page.getByRole('menuitem', { name: 'Close session' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Session closed' })).toHaveText(
    /Session closed\. You wrote \d+ words?\./,
  );
});

/** The project's session rows, read from Vlo's own database. */
function sessionRows(page: Page) {
  return page.evaluate(
    () =>
      new Promise<{ startedAt: number; endedAt: number; wordsAdded: number }[]>((resolve, reject) => {
        const open = indexedDB.open('vlo');
        open.onerror = () => {
          reject(open.error ?? new Error('open failed'));
        };
        open.onsuccess = () => {
          const request = open.result.transaction('sessions').objectStore('sessions').getAll();
          request.onsuccess = () => {
            open.result.close();
            resolve(request.result as { startedAt: number; endedAt: number; wordsAdded: number }[]);
          };
        };
      }),
  );
}

test('leaving the project ends a running session with the words it added', async ({ page }) => {
  await newNovel(page);
  await page.getByRole('button', { name: 'Timer' }).click();
  await page.getByRole('menuitem', { name: 'Write for 25 minutes' }).click();
  await expect(page.getByRole('button', { name: /^Session timer, / })).toBeVisible();
  await scene(page, 1).click();
  await page.keyboard.type('Rain on the ledger tonight.');
  await expect(page.getByText('5 words')).toBeVisible();
  const left = Date.now();
  await page.getByRole('link', { name: 'Library' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Library' })).toBeVisible();

  await expect.poll(async () => (await sessionRows(page))[0]?.wordsAdded).toBe(5);
  const [row] = await sessionRows(page);
  // Ended when the writer left, not at the planned end 25 minutes later.
  expect(row?.endedAt).toBeLessThan(left + 60_000);
});

for (const theme of ['ink', 'paper', 'sepia'] as const) {
  test(`the editor and its tools have no serious axe issues in ${theme}`, async ({ page }) => {
    await page.addInitScript((t) => {
      localStorage.setItem('vlo:preferences', JSON.stringify({ theme: t, calm: false }));
    }, theme);
    await newNovel(page);
    await page.keyboard.type('The tide goes out.');
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    expect(await seriousIssues(page)).toEqual([]);
  });
}
