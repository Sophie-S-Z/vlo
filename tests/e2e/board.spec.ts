import { expect, test, type CDPSession, type Page } from '@playwright/test';
import { seriousIssues } from './support/axe';
import { skipOnboarding } from './support/onboarding';

/*
 * Plan Tasks C2 and C3: the Story Board, its List view and the Plot Grid. A novel starts with Chapter 1
 * and Scene 1, so "Cards from scenes" gives the first card.
 */

declare global {
  interface Window {
    __viewTransitions: number;
  }
}

const board = (page: Page) => page.getByRole('region', { name: 'Story Board' });
const card = (page: Page, name: string) => board(page).getByRole('group', { name, exact: true });
/** The board page's message line. */
const status = (page: Page) => page.locator('p[role="status"]').filter({ hasNotText: /^$/ }).first();
const zoom = async (page: Page) =>
  parseInt((await page.getByRole('status', { name: 'Zoom' }).textContent()) ?? '', 10);
/** The layer that moves and scales: its transform is the board view. */
const layer = (page: Page) => board(page).locator(':scope > div').first();

async function newNovelBoard(page: Page) {
  await skipOnboarding(page);
  await page.getByRole('button', { name: 'New project' }).click();
  await page
    .getByRole('dialog', { name: 'New project' })
    .getByRole('button', { name: 'Create project' })
    .click();
  await expect(page.getByRole('textbox', { name: 'Scene 1' })).toBeFocused();
  await page.getByRole('navigation', { name: 'Project views' }).getByRole('link', { name: 'Board' }).click();
  await showCanvas(page);
}

/** Under 600 px the board opens as the List view (product owner decision). The canvas is one tap away. */
async function showCanvas(page: Page) {
  if ((page.viewportSize()?.width ?? 1280) < 600) {
    await expect(page.getByRole('button', { name: 'List', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await page.getByRole('button', { name: 'Canvas' }).click();
  }
  await expect(board(page)).toBeVisible();
}

async function addCard(page: Page, title: string) {
  await page.getByRole('button', { name: 'Add card' }).click();
  const dialog = page.getByRole('dialog', { name: 'Add a card' });
  await dialog.getByLabel('Title').fill(title);
  await dialog.getByRole('button', { name: 'Add card' }).click();
  await expect(dialog).toBeHidden();
  await expect(card(page, title)).toBeVisible();
}

async function addThread(page: Page, name: string) {
  await page.getByRole('button', { name: 'Threads' }).click();
  const dialog = page.getByRole('dialog', { name: 'Threads' });
  await dialog.getByLabel('New thread', { exact: true }).fill(name);
  await dialog.getByRole('button', { name: 'Add thread' }).click();
  await expect(dialog.getByRole('list', { name: 'Threads' }).getByLabel(`Name of ${name}`)).toHaveValue(name);
  await dialog.getByRole('button', { name: 'Done' }).click();
  await expect(dialog).toBeHidden();
}

async function cardMenu(page: Page, title: string, item: string) {
  await page
    .getByRole('button', { name: `Options for ${title}` })
    .first()
    .click();
  await page.getByRole('menuitem', { name: item }).click();
}

/** Arrival and Scene 1 on the debt thread: the setup of the link, list and grid tests. */
async function linkedBoard(page: Page) {
  await newNovelBoard(page);
  await page.getByRole('button', { name: 'Cards from scenes' }).click();
  await expect(status(page)).toHaveText('Made 1 card from a scene.');
  await addCard(page, 'Arrival');
  await addThread(page, 'The debt');
  await cardMenu(page, 'Arrival', 'Links…');
  const dialog = page.getByRole('dialog', { name: 'Links of Arrival' });
  await dialog.getByLabel('Link to').selectOption({ label: 'Scene 1' });
  await dialog.getByLabel('Thread').selectOption({ label: 'The debt' });
  await dialog.getByRole('button', { name: 'Link cards' }).click();
  await expect(dialog.getByRole('list', { name: 'Links of Arrival' })).toContainText('Scene 1, on The debt');
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
}

test('US05: a double-click on a linked card opens its scene in under 1 s', async ({ page }) => {
  await newNovelBoard(page);
  await page.getByRole('button', { name: 'Cards from scenes' }).click();
  await expect(card(page, 'Scene 1')).toBeVisible();

  const started = Date.now();
  await card(page, 'Scene 1').locator('h3').dblclick();
  await expect(page.getByRole('textbox', { name: 'Scene 1' })).toBeVisible();
  expect(Date.now() - started).toBeLessThan(1000);
  // The address names the card, so the scene editor takes its transition name.
  expect(new URL(page.url()).searchParams.get('card')).not.toBeNull();
});

test('the keyboard moves a card, opens its form, deletes it and Undo puts it back', async ({ page }) => {
  await newNovelBoard(page);
  await addCard(page, 'Arrival');
  const arrival = card(page, 'Arrival');
  await arrival.focus();
  const before = await arrival.evaluate((el) => el.style.transform);

  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Shift+ArrowDown');
  const place = (transform: string) => {
    const [x = '0', y = '0'] = /translate\(([-\d.]+)px, ([-\d.]+)px\)/.exec(transform)?.slice(1) ?? [];
    return { x: Number(x), y: Number(y) };
  };
  const start = place(before);
  // Each key press counts, even when the presses come faster than the screen updates.
  await expect
    .poll(async () => {
      const now = place(await arrival.evaluate((el) => el.style.transform));
      return { dx: now.x - start.x, dy: now.y - start.y };
    })
    .toEqual({ dx: 16, dy: 64 });
  await expect(status(page)).toHaveText(`Arrival moved to ${String(start.x + 16)}, ${String(start.y + 64)}.`);

  // A card with no scene opens its form on Enter.
  await arrival.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog', { name: 'Edit Arrival' })).toBeVisible();
  await page.keyboard.press('Escape');

  await arrival.focus();
  await page.keyboard.press('Delete');
  await expect(arrival).toHaveCount(0);
  await expect(status(page)).toHaveText('Deleted the card Arrival.');
  const undo = page.getByRole('button', { name: 'Undo' });
  await expect(undo).toBeFocused();
  await undo.click();
  await expect(card(page, 'Arrival')).toBeVisible();
  await expect(status(page)).toHaveText('Restored the card Arrival.');
});

test('a link made from the menu shows on the board, in the list and in the Plot Grid', async ({ page }) => {
  await linkedBoard(page);
  await expect(board(page).locator('[data-board-threads] path')).toHaveCount(1);

  // List view: the same cards, sortable, with the thread.
  await page.getByRole('button', { name: 'List', exact: true }).click();
  const table = page.getByRole('table', { name: 'Cards on the Story Board' });
  await expect(table).toBeVisible();
  const titles = () => table.getByRole('rowheader').allTextContents();
  await table.getByRole('button', { name: 'Card' }).click();
  expect(await titles()).toEqual(['Arrival', 'Scene 1']);
  await expect(table.getByRole('columnheader', { name: 'Card' })).toHaveAttribute('aria-sort', 'ascending');
  await table.getByRole('button', { name: 'Card' }).click();
  expect(await titles()).toEqual(['Scene 1', 'Arrival']);
  await expect(table.getByRole('row', { name: /Arrival/ })).toContainText('The debt');

  // Plot Grid: Scene 1 sits in Chapter 1. Arrival has no scene, so it sits in "No chapter".
  await page
    .getByRole('navigation', { name: 'Project views' })
    .getByRole('link', { name: 'Plot Grid' })
    .click();
  await expect(page.getByRole('table', { name: 'Plot Grid: chapters by threads' })).toBeVisible();
  await expect(page.getByRole('list', { name: 'Chapter 1, The debt' })).toContainText('Scene 1');
  await expect(page.getByRole('list', { name: 'No chapter, The debt' })).toContainText('Arrival');
  await expect(page).toHaveTitle(/Plot Grid/);

  // A move to another thread carries the link, so Arrival moves with Scene 1.
  await addThread(page, 'The secret');
  await cardMenu(page, 'Scene 1', 'Move to thread…');
  const dialog = page.getByRole('dialog', { name: 'Move Scene 1 to another thread' });
  await expect(dialog).toContainText('with the cards at their other ends: Arrival');
  await dialog.getByLabel('Thread').selectOption({ label: 'The secret' });
  await dialog.getByRole('button', { name: 'Move card' }).click();
  await expect(status(page)).toHaveText('Moved Scene 1 to The secret.');
  await expect(page.getByRole('list', { name: 'Chapter 1, The secret' })).toContainText('Scene 1');
  await expect(page.getByRole('list', { name: 'No chapter, The secret' })).toContainText('Arrival');
  await expect(page.getByRole('list', { name: 'Chapter 1, The debt' })).not.toContainText('Scene 1');
});

test('the Plot Grid moves a scene to another chapter', async ({ page, isMobile }) => {
  test.skip(isMobile, 'Under 600 px the binder is a drawer. The move dialog is the same.');
  await newNovelBoard(page);
  // A second chapter, from the binder of the writing screen.
  await page.getByRole('navigation', { name: 'Project views' }).getByRole('link', { name: 'Write' }).click();
  await page.getByRole('button', { name: 'Add to binder' }).click();
  await page.getByRole('menuitem', { name: 'Chapter' }).click();
  await expect(
    page.getByRole('navigation', { name: 'Binder' }).getByRole('button', { name: 'Options for Chapter 2' }),
  ).toBeVisible();
  await page
    .getByRole('navigation', { name: 'Project views' })
    .getByRole('link', { name: 'Plot Grid' })
    .click();
  await page.getByRole('button', { name: 'Cards from scenes' }).click();
  await expect(page.getByRole('list', { name: 'Chapter 1, No thread' })).toContainText('Scene 1');

  await cardMenu(page, 'Scene 1', 'Move scene to chapter…');
  const dialog = page.getByRole('dialog', { name: 'Move Scene 1' });
  await expect(dialog.getByLabel('Chapter')).toHaveValue(/.+/);
  await dialog.getByRole('button', { name: 'Move scene' }).click();
  await expect(page.getByRole('list', { name: 'Chapter 2, No thread' })).toContainText('Scene 1');
  await expect(page.getByRole('list', { name: 'Chapter 1, No thread' })).not.toContainText('Scene 1');
  await expect(status(page)).toHaveText('Moved Scene 1 to Chapter 2.');
});

test('a drag from the link handle onto another card links the two', async ({ page, isMobile }) => {
  test.skip(isMobile, 'The pointer drag runs on the desktop projects. The menu covers touch and keys.');
  await newNovelBoard(page);
  await page.getByRole('button', { name: 'Cards from scenes' }).click();
  await addCard(page, 'Arrival');
  const handle = card(page, 'Arrival').locator('[data-link-handle]');
  const from = await handle.boundingBox();
  const to = await card(page, 'Scene 1').locator('h3').boundingBox();
  if (!from || !to) throw new Error('The cards have no box.');
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(to.x + 10, to.y + 10, { steps: 8 });
  await page.mouse.up();
  await expect(status(page)).toHaveText('Linked Arrival to Scene 1. Pick a thread for it in Links.');
  await expect(board(page).locator('[data-board-threads] path')).toHaveCount(1);
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

  test('the views switch at once and a double-click opens the scene with no zoom', async ({ page }) => {
    await newNovelBoard(page);
    await page.getByRole('button', { name: 'Cards from scenes' }).click();
    const views = page.getByRole('navigation', { name: 'Project views' });
    await views.getByRole('link', { name: 'Plot Grid' }).click();
    await expect(page.getByRole('list', { name: 'Chapter 1, No thread' })).toContainText('Scene 1');
    await views.getByRole('link', { name: 'Board' }).click();
    await showCanvas(page);
    await expect(card(page, 'Scene 1')).toBeVisible();
    await card(page, 'Scene 1').locator('h3').dblclick();
    await expect(board(page)).toBeHidden();
    await expect(page.getByRole('textbox', { name: 'Scene 1' })).toBeVisible();
    const state = await page.evaluate(() => ({
      transitions: window.__viewTransitions,
      animations: document.getAnimations().map((a) => (a as CSSAnimation).animationName || 'transition'),
    }));
    expect(state.transitions).toBe(0);
    expect(state.animations).toEqual([]);
  });
});

test('the canvas, the List view and the Plot Grid have no serious axe issues', async ({ page }) => {
  await linkedBoard(page);
  expect(await seriousIssues(page)).toEqual([]);
  await page.getByRole('button', { name: 'List', exact: true }).click();
  await expect(page.getByRole('table', { name: 'Cards on the Story Board' })).toBeVisible();
  expect(await seriousIssues(page)).toEqual([]);
  await page
    .getByRole('navigation', { name: 'Project views' })
    .getByRole('link', { name: 'Plot Grid' })
    .click();
  await expect(page.getByRole('table', { name: 'Plot Grid: chapters by threads' })).toBeVisible();
  expect(await seriousIssues(page)).toEqual([]);
});

/* Touch at 390 px (Review Focus 3). Chromium takes real touch points through the DevTools protocol. */

interface TouchPoint {
  x: number;
  y: number;
}

async function touch(cdp: CDPSession, type: 'touchStart' | 'touchMove' | 'touchEnd', points: TouchPoint[]) {
  await cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points.map((p, id) => ({ ...p, id })) });
}

async function pinchOut(cdp: CDPSession, center: TouchPoint, from: number, to: number, steps: number) {
  const at = (gap: number): TouchPoint[] => [
    { x: center.x - gap / 2, y: center.y },
    { x: center.x + gap / 2, y: center.y },
  ];
  // The fingers land one after the other, as on a real screen.
  await touch(cdp, 'touchStart', at(from).slice(0, 1));
  await touch(cdp, 'touchStart', at(from));
  for (let i = 1; i <= steps; i += 1) await touch(cdp, 'touchMove', at(from + ((to - from) * i) / steps));
  await touch(cdp, 'touchEnd', []);
}

/**
 * The board's box in the viewport, scrolled into view, as touch points need. The screen change into
 * the board fades for 500 ms, and while it runs every touch lands on the fading picture, so it waits.
 */
async function boardBox(page: Page) {
  await board(page).scrollIntoViewIfNeeded();
  await page.evaluate(async () => {
    const finite = document
      .getAnimations()
      .filter((a) => Number.isFinite(a.effect?.getComputedTiming().endTime ?? Infinity));
    await Promise.all(finite.map((a) => a.finished.catch(() => undefined)));
  });
  const box = await board(page).boundingBox();
  if (!box) throw new Error('The board has no box.');
  const viewport = page.viewportSize();
  const bottom = Math.min(box.y + box.height, viewport?.height ?? box.y + box.height);
  return { x: box.x, y: box.y, width: box.width, height: bottom - box.y };
}

/** Writes `count` cards for the open project straight into IndexedDB, then reloads the board. */
async function seedCards(page: Page, count: number) {
  const projectId = /\/p\/([^/]+)\/board/.exec(page.url())?.[1] ?? '';
  await page.evaluate(
    async ({ n, projectId }) => {
      await new Promise<void>((resolve, reject) => {
        const open = indexedDB.open('vlo');
        open.onerror = () => {
          reject(open.error ?? new Error('open failed'));
        };
        open.onsuccess = () => {
          const db = open.result;
          const tx = db.transaction('cards', 'readwrite');
          for (let i = 0; i < n; i += 1) {
            tx.objectStore('cards').put({
              id: `seed-card-${String(i)}`,
              projectId,
              title: `Beat ${String(i + 1)}`,
              note: 'Someone wants something and cannot have it yet.',
              x: (i % 20) * 232,
              y: Math.floor(i / 20) * 152,
              color: ['paper', 'amber', 'sage', 'sky', 'rose', 'lilac'][i % 6] ?? 'paper',
            });
          }
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
    { n: count, projectId },
  );
  await page.reload();
}

test.describe('on a phone', () => {
  test.skip(
    ({ isMobile, browserName }) => !isMobile || browserName !== 'chromium',
    'Touch through Chromium.',
  );
  test.use({ viewport: { width: 390, height: 844 } });

  test('one finger pans the board and two fingers pinch to zoom', async ({ page }) => {
    await newNovelBoard(page);
    await page.getByRole('button', { name: 'Cards from scenes' }).click();
    await expect(card(page, 'Scene 1')).toBeVisible();
    const box = await boardBox(page);
    const cdp = await page.context().newCDPSession(page);

    // A pan on empty board, below the card.
    const before = await layer(page).evaluate((el) => el.style.transform);
    const start = { x: box.x + 40, y: box.y + box.height - 40 };
    await touch(cdp, 'touchStart', [start]);
    for (let i = 1; i <= 6; i += 1)
      await touch(cdp, 'touchMove', [{ x: start.x - i * 10, y: start.y - i * 6 }]);
    await touch(cdp, 'touchEnd', []);
    await expect.poll(() => layer(page).evaluate((el) => el.style.transform)).not.toBe(before);

    const zoomBefore = await zoom(page);
    await pinchOut(cdp, { x: box.x + box.width / 2, y: box.y + box.height / 2 }, 80, 240, 10);
    await expect.poll(() => zoom(page)).toBeGreaterThan(zoomBefore);
    expect(await page.evaluate(() => window.getSelection()?.toString() ?? '')).toBe('');
  });

  test('a pinch over 200 cards keeps 60 frames a second with the CPU at a quarter speed', async ({
    page,
  }) => {
    await newNovelBoard(page);
    await seedCards(page, 200);
    await expect(board(page).getByRole('group')).toHaveCount(200);
    const box = await boardBox(page);
    const cdp = await page.context().newCDPSession(page);
    const zoomBefore = await zoom(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });

    // Each frame that does the work of one gesture step: its time from start to the next frame.
    await page.evaluate(() => {
      const w = window as Window & { __frames?: number[] };
      w.__frames = [];
      let last = performance.now();
      const tick = (now: number) => {
        w.__frames?.push(now - last);
        last = now;
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    const center = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    await pinchOut(cdp, center, 60, 260, 30);
    const frames = await page.evaluate(() => (window as Window & { __frames?: number[] }).__frames ?? []);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });

    const sorted = [...frames].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)] ?? Infinity;
    console.log(
      `pinch over 200 cards at 4x slowdown: ${String(frames.length)} frames, median ${median.toFixed(1)} ms`,
    );
    expect(frames.length).toBeGreaterThan(10);
    await expect.poll(() => zoom(page)).toBeGreaterThan(zoomBefore);
    // 60 frames a second is a frame each 16.7 ms, and a frame that misses it takes 33 ms. Local Chromium
    // keeps the pace (plan Review Focus 3). A CI runner is up to two times slower, so it has a 25 ms
    // ceiling: the median frame still may not miss the screen's refresh.
    expect(median).toBeLessThan(process.env.CI ? 25 : 17.5);
    expect(await page.evaluate(() => window.getSelection()?.toString() ?? '')).toBe('');
  });
});
