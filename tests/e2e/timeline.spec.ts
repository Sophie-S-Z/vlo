import { expect, test, type CDPSession, type Page } from '@playwright/test';
import { seriousIssues } from './support/axe';
import { skipOnboarding } from './support/onboarding';

/*
 * Plan Task C4: the Memory Timeline. A memoir starts with "Memory 1", which has no date, so it sits on
 * the Undated shelf.
 */

declare global {
  interface Window {
    __viewTransitions: number;
  }
}

const track = (page: Page) => page.getByRole('region', { name: 'Memory Timeline' });
const memory = (page: Page, name: string) => page.getByRole('group', { name: new RegExp(`^${name}, `) });
const shelf = (page: Page) => page.getByRole('region', { name: /^Undated/ });
const status = (page: Page) => page.locator('p[role="status"]').first();
const count = (page: Page) => page.getByTestId('memory-count');
const pressed = (page: Page, group: string) =>
  page.getByRole('group', { name: group }).locator('[aria-pressed="true"]');

async function newMemoirTimeline(page: Page) {
  await skipOnboarding(page);
  await page.getByRole('button', { name: 'New project' }).click();
  const dialog = page.getByRole('dialog', { name: 'New project' });
  await dialog.getByRole('checkbox', { name: /Memoir/ }).click();
  await dialog.getByRole('button', { name: 'Create project' }).click();
  await expect(page.getByRole('textbox', { name: 'Memory 1' })).toBeVisible();
  await page
    .getByRole('navigation', { name: 'Project views' })
    .getByRole('link', { name: 'Timeline' })
    .click();
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await showTrack(page);
}

/** Under 600 px the timeline opens as the List view (product owner decision). The track is one tap away. */
async function showTrack(page: Page) {
  if ((page.viewportSize()?.width ?? 1280) < 600) {
    await expect(pressed(page, 'Show the timeline as')).toHaveText('List');
    await page.getByRole('button', { name: 'Track', exact: true }).click();
  }
  await expect(track(page)).toBeVisible();
}

async function addMemory(page: Page, title: string, date: string, themes = '') {
  await page.getByRole('button', { name: 'Add memory' }).click();
  const dialog = page.getByRole('dialog', { name: /^Edit Memory/ });
  await dialog.getByLabel('Title').fill(title);
  await dialog.getByLabel('Date', { exact: true }).fill(date);
  await dialog.getByLabel('New themes, with commas between them').fill(themes);
  await dialog.getByRole('button', { name: 'Save memory' }).click();
  await expect(dialog).toBeHidden();
}

/** Waits for the screen change into the timeline to end, so pointer and touch input reach the page. */
async function settle(page: Page) {
  await page.evaluate(async () => {
    const finite = document
      .getAnimations()
      .filter((a) => Number.isFinite(a.effect?.getComputedTiming().endTime ?? Infinity));
    await Promise.all(finite.map((a) => a.finished.catch(() => undefined)));
  });
}

async function dragTo(page: Page, from: { x: number; y: number }, to: { x: number; y: number }) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 12 });
  await page.mouse.up();
}

const middle = async (page: Page, name: string) => {
  const box = await memory(page, name).locator('h3').boundingBox();
  if (!box) throw new Error(`${name} has no box.`);
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
};

test('US07: By theme regroups the memories, and the count stays the same', async ({ page }) => {
  await newMemoirTimeline(page);
  await addMemory(page, 'The kitchen', '1999-03', 'Food, Family');
  await addMemory(page, 'Grandmother’s hands', '1991', 'Family');
  await addMemory(page, 'The flood', '1993-07-12');
  await expect(count(page)).toHaveText('4 memories');
  const before = await count(page).textContent();

  await page.getByRole('button', { name: 'By theme' }).click();
  await expect(page.getByRole('region', { name: 'Family' }).getByRole('listitem')).toHaveCount(2);
  await expect(page.getByRole('region', { name: 'Food' }).getByRole('listitem')).toHaveCount(1);
  // "No theme" holds the flood and the starter memory, in date order with the undated one last.
  await expect(page.getByRole('region', { name: 'No theme' }).getByRole('listitem')).toHaveText([
    /The flood/,
    /Memory 1/,
  ]);
  expect(await count(page).textContent()).toBe(before);

  await page.getByRole('button', { name: 'By time' }).click();
  await expect(track(page).or(page.getByRole('table', { name: 'Memories by date' }))).toBeVisible();
  expect(await count(page).textContent()).toBe(before);
});

test('a drag moves a memory to a new date, to the shelf and back onto the track', async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, 'The pointer drag runs on the desktop projects. Touch has its own test.');
  await newMemoirTimeline(page);
  await addMemory(page, 'The flood', '1993-07-12');
  await settle(page);
  await expect(pressed(page, 'Scale')).toHaveText('Years');

  // One year at the Years scale is 0.33 px a day, about 120 px. A drop at Years scale gives a year only.
  const start = await middle(page, 'The flood');
  await dragTo(page, start, { x: start.x + 121, y: start.y });
  await expect(status(page)).toHaveText('The flood moved to 1994.');
  await expect(memory(page, 'The flood')).toHaveAccessibleName('The flood, 1994');

  // Onto the shelf: the memory loses its date.
  await shelf(page).scrollIntoViewIfNeeded();
  const box = await shelf(page).boundingBox();
  if (!box) throw new Error('The shelf has no box.');
  await dragTo(page, await middle(page, 'The flood'), { x: box.x + box.width - 40, y: box.y + 30 });
  await expect(shelf(page).getByRole('group', { name: 'The flood, no date' })).toBeVisible();

  // From the shelf onto the track: the memory gets the year under the pointer. The page scrolls so the
  // track and the shelf are both on the screen.
  await page.evaluate(() => {
    const top = document.querySelector('[aria-label="Memory Timeline"]')?.getBoundingClientRect().top ?? 0;
    window.scrollTo(0, window.scrollY + top - 8);
  });
  const area = await track(page).boundingBox();
  if (!area) throw new Error('The track has no box.');
  await dragTo(page, await middle(page, 'Memory 1'), { x: area.x + area.width / 2, y: area.y + 150 });
  await expect(status(page)).toHaveText(/^Memory 1 moved to \d{4}\.$/);
  await expect(shelf(page).getByRole('group', { name: 'Memory 1, no date' })).toHaveCount(0);
});

test('Left and Right move a memory by one unit of the scale', async ({ page }) => {
  await newMemoirTimeline(page);
  await addMemory(page, 'First day of school', '1992-09');
  const card = memory(page, 'First day of school');

  await card.focus();
  await page.keyboard.press('ArrowRight');
  await expect(card).toHaveAccessibleName('First day of school, September 1993');
  await page.getByRole('button', { name: 'Months' }).click();
  await card.focus();
  await page.keyboard.press('ArrowLeft');
  await expect(card).toHaveAccessibleName('First day of school, August 1993');
  // At Days scale a month takes its middle day, so a key gives a full date.
  await page.getByRole('button', { name: 'Days' }).click();
  await card.focus();
  await page.keyboard.press('ArrowRight');
  await expect(card).toHaveAccessibleName('First day of school, August 17, 1993');
  await expect(card).toBeFocused();

  // Enter opens the memory.
  await page.keyboard.press('Enter');
  await expect(page.getByRole('textbox', { name: 'First day of school' })).toBeVisible();
});

test('life stages show as bands, and a deleted stage leaves its memories in place', async ({ page }) => {
  await newMemoirTimeline(page);
  await addMemory(page, 'Grandmother’s hands', '1991');
  await page.getByRole('button', { name: 'Life stages' }).click();
  const dialog = page.getByRole('dialog', { name: 'Life stages' });
  await dialog.getByLabel('New life stage', { exact: true }).fill('Childhood');
  await dialog.getByLabel('Starts', { exact: true }).fill('1986');
  await dialog.getByLabel('Ends', { exact: true }).fill('1980');
  await dialog.getByRole('button', { name: 'Add life stage' }).click();
  await expect(dialog.getByRole('alert')).toHaveText('A life stage must end after it starts.');
  await dialog.getByLabel('Ends', { exact: true }).fill('1997');
  await dialog.getByRole('button', { name: 'Add life stage' }).click();
  await expect(dialog.getByLabel('Name of Childhood')).toHaveValue('Childhood');
  await dialog.getByRole('button', { name: 'Done' }).click();
  await expect(track(page)).toContainText('Childhood');

  await page.getByRole('button', { name: 'Life stages' }).click();
  await dialog.getByRole('button', { name: 'Delete the life stage Childhood' }).click();
  await dialog.getByRole('button', { name: 'Done' }).click();
  await expect(track(page)).not.toContainText('Childhood');
  await expect(memory(page, 'Grandmother’s hands')).toHaveAccessibleName('Grandmother’s hands, 1991');
});

test.describe('with Calm mode on', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('vlo:preferences', JSON.stringify({ theme: 'system', calm: true }));
      window.__viewTransitions = 0;
      if (typeof document.startViewTransition !== 'function') return;
      const start = document.startViewTransition.bind(document);
      document.startViewTransition = ((...args: Parameters<typeof start>) => {
        window.__viewTransitions += 1;
        return start(...args);
      }) as typeof document.startViewTransition;
    });
  });

  test('By theme and By time switch at once', async ({ page }) => {
    await newMemoirTimeline(page);
    await addMemory(page, 'The kitchen', '1999-03', 'Food');
    await page.getByRole('button', { name: 'By theme' }).click();
    await expect(page.getByRole('region', { name: 'Food' })).toBeVisible();
    await page.getByRole('button', { name: 'By time' }).click();
    await showTrack(page);
    const state = await page.evaluate(() => ({
      transitions: window.__viewTransitions,
      animations: document.getAnimations().map((a) => (a as CSSAnimation).animationName || 'transition'),
    }));
    expect(state.transitions).toBe(0);
    expect(state.animations).toEqual([]);
  });
});

test('the track, the List view and By theme have no serious axe issues', async ({ page }) => {
  await newMemoirTimeline(page);
  await addMemory(page, 'The kitchen', '1999-03', 'Food, Family');
  await page.getByRole('button', { name: 'Life stages' }).click();
  const dialog = page.getByRole('dialog', { name: 'Life stages' });
  await dialog.getByLabel('New life stage', { exact: true }).fill('Lisbon years');
  await dialog.getByLabel('Starts', { exact: true }).fill('1998-09');
  await dialog.getByLabel('Ends', { exact: true }).fill('2004-06');
  await dialog.getByRole('button', { name: 'Add life stage' }).click();
  expect(await seriousIssues(page)).toEqual([]);
  await dialog.getByRole('button', { name: 'Done' }).click();
  expect(await seriousIssues(page)).toEqual([]);
  await page.getByRole('button', { name: 'List', exact: true }).click();
  await expect(page.getByRole('table', { name: 'Memories by date' })).toBeVisible();
  expect(await seriousIssues(page)).toEqual([]);
  await page.getByRole('button', { name: 'By theme' }).click();
  await expect(page.getByRole('region', { name: 'Food' })).toBeVisible();
  expect(await seriousIssues(page)).toEqual([]);
});

/* Touch at 390 px. Chromium takes real touch points through the DevTools protocol. */

interface TouchPoint {
  x: number;
  y: number;
}

async function touch(cdp: CDPSession, type: 'touchStart' | 'touchMove' | 'touchEnd', points: TouchPoint[]) {
  await cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points.map((p, id) => ({ ...p, id })) });
}

test.describe('on a phone', () => {
  test.skip(
    ({ isMobile, browserName }) => !isMobile || browserName !== 'chromium',
    'Touch through Chromium.',
  );
  test.use({ viewport: { width: 390, height: 844 } });

  test('the List view comes first; on the track one finger pans and two fingers change the scale', async ({
    page,
  }) => {
    await newMemoirTimeline(page);
    await addMemory(page, 'The kitchen', '1999-03');
    await addMemory(page, 'The flood', '1993-07-12');
    await settle(page);
    await track(page).scrollIntoViewIfNeeded();
    const box = await track(page).boundingBox();
    if (!box) throw new Error('The track has no box.');
    const cdp = await page.context().newCDPSession(page);
    const scrollLeft = () => track(page).evaluate((el) => el.scrollLeft);

    // A pan on the empty axis row.
    const before = await scrollLeft();
    const start = { x: box.x + box.width - 40, y: box.y + 16 };
    await touch(cdp, 'touchStart', [start]);
    for (let i = 1; i <= 8; i += 1) await touch(cdp, 'touchMove', [{ x: start.x - i * 20, y: start.y }]);
    await touch(cdp, 'touchEnd', []);
    await expect.poll(scrollLeft).not.toBe(before);

    // A pinch from Years to Months.
    await expect(pressed(page, 'Scale')).toHaveText('Years');
    const center = { x: box.x + box.width / 2, y: box.y + 16 };
    const at = (gap: number): TouchPoint[] => [
      { x: center.x - gap / 2, y: center.y },
      { x: center.x + gap / 2, y: center.y },
    ];
    await touch(cdp, 'touchStart', at(40).slice(0, 1));
    await touch(cdp, 'touchStart', at(40));
    for (let i = 1; i <= 12; i += 1) await touch(cdp, 'touchMove', at(40 + i * 25));
    await touch(cdp, 'touchEnd', []);
    await expect(pressed(page, 'Scale')).toHaveText('Months');
    expect(await page.evaluate(() => window.getSelection()?.toString() ?? '')).toBe('');
  });
});
