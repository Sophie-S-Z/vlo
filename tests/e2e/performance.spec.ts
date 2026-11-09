import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import JSZip from 'jszip';
import { skipOnboarding } from './support/onboarding';
import { useTool } from './support/tools';
import { seedProjects } from './support/seed';
import { seedLarge } from './support/seed-bundle';

/* Gate 1: the budgets in VLO_SPEC section 12, measured on the seeded 100,000-word project. */

// A trace takes DOM snapshots during each step, and on a 10,000-word page that cost would count against the budgets.
test.use({ bypassCSP: true, trace: 'off' });

declare global {
  interface Window {
    __itemOpens: string[];
    /** When each item database finished opening, for the stage timings in the log. */
    __itemOpenedAt: number[];
    /** When the stored updates of an item finished loading. */
    __itemReadAt: number[];
    /** When a new manuscript element went into the page, at the end of the task that built it. */
    __manuscriptAt: number[];
    __keyDelays: number[];
    /** The long main-thread tasks during an export. */
    __longTasks: number[];
    /** The longest event of each interaction, by interaction id. */
    __interactions: Record<string, number>;
    /** Calls `done` once the next frame has rendered. */
    __afterPaint: (done: () => void) => void;
  }
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.__itemOpens = [];
    window.__itemOpenedAt = [];
    window.__itemReadAt = [];
    window.__manuscriptAt = [];
    window.__keyDelays = [];
    const store = IDBObjectStore.prototype;
    // The wrapper below calls it with the store as `this`.
    // eslint-disable-next-line @typescript-eslint/unbound-method
    const getAll = store.getAll;
    store.getAll = function (this: IDBObjectStore, ...args: Parameters<IDBObjectStore['getAll']>) {
      const request = getAll.apply(this, args);
      if (this.name === 'updates' && this.transaction.db.name.startsWith('vlo-item-')) {
        request.addEventListener('success', () => {
          window.__itemReadAt.push(performance.now());
        });
      }
      return request;
    };
    new MutationObserver((records) => {
      for (const record of records) {
        for (const node of record.addedNodes) {
          if (
            node instanceof Element &&
            (node.matches('.vlo-manuscript') || node.querySelector('.vlo-manuscript'))
          ) {
            window.__manuscriptAt.push(performance.now());
          }
        }
      }
    }).observe(document, { childList: true, subtree: true });
    const factory = IDBFactory.prototype;
    const open = factory.open.bind(indexedDB);
    factory.open = (name: string, version?: number) => {
      const request = version === undefined ? open(name) : open(name, version);
      if (name.startsWith('vlo-item-')) {
        window.__itemOpens.push(name);
        request.addEventListener('success', () => {
          window.__itemOpenedAt.push(performance.now());
        });
      }
      return request;
    };
    // Keystroke to screen: from the key event until the next frame has done its style, layout and paint.
    // A message posted in the frame callback runs after that frame's rendering work.
    window.__afterPaint = (done: () => void) => {
      requestAnimationFrame(() => {
        const channel = new MessageChannel();
        channel.port1.onmessage = done;
        channel.port2.postMessage(null);
      });
    };
    window.addEventListener(
      'keydown',
      (event) => {
        // Only keys that type a character. Modifier and arrow keys do not change the text.
        if (event.key.length !== 1) return;
        const start = event.timeStamp;
        window.__afterPaint(() => {
          window.__keyDelays.push(performance.now() - start);
        });
      },
      true,
    );
  });
});

test('Gate 1: the 100,000-word project opens its 10,000-word scene fast and types fast', async ({
  page,
  browserName,
  isMobile,
}) => {
  test.slow();
  await skipOnboarding(page);
  // Review Focus 3 of Phase 8: the style check and the Codex names are on, so their marks count in the budget.
  await page.evaluate(() => {
    localStorage.setItem('vlo:writing', JSON.stringify({ toolLevel: 'full', styleCheck: true }));
  });
  const seeded = await seedLarge(page);
  // The Codex names are on too: an entry whose names come in the typed text.
  await page.evaluate(
    (projectId) =>
      new Promise<void>((resolve, reject) => {
        const open = indexedDB.open('vlo');
        open.onerror = () => {
          reject(open.error ?? new Error('No database.'));
        };
        open.onsuccess = () => {
          const tx = open.result.transaction('codex', 'readwrite');
          tx.objectStore('codex').put({
            id: 'codex-lamp',
            projectId,
            kind: 'thing',
            name: 'lamp',
            aliases: ['water'],
            order: 'a0',
          });
          tx.oncomplete = () => {
            open.result.close();
            resolve();
          };
          tx.onerror = () => {
            reject(tx.error ?? new Error('No write.'));
          };
        };
      }),
    seeded.projectId,
  );

  // A cold page load straight to the scene also boots the app. It is logged for STATUS, not held to the budget.
  await page.goto(`/p/${seeded.projectId}?item=${seeded.longSceneId}`);
  const coldAt = await page.waitForFunction(
    (end) => {
      const last = document.querySelector('.vlo-manuscript')?.lastElementChild;
      return last?.textContent.endsWith(end) ? performance.now() : false;
    },
    seeded.longSceneEnd,
    { polling: 'raf' },
  );
  console.log(
    `[${browserName}] cold page load to the scene's text: ${Number(await coldAt.jsonValue()).toFixed(0)} ms`,
  );

  // The budget: the writer picks the scene in the binder while another item is open.
  await page.goto(`/p/${seeded.projectId}?item=${seeded.projectId}-002`);
  const editor = page.getByRole('textbox', { name: seeded.longSceneTitle });
  await expect(page.getByRole('textbox', { name: 'Scene 1.1' })).toBeVisible();
  // Phones get the binder as a drawer.
  if (isMobile) await page.getByRole('button', { name: 'Binder' }).click();
  await expect(
    page.getByRole('navigation', { name: 'Binder' }).getByText(seeded.longSceneTitle),
  ).toBeVisible();
  await page.evaluate(() => {
    window.__itemOpens = [];
    window.__itemOpenedAt = [];
    window.__itemReadAt = [];
    window.__manuscriptAt = [];
  });
  const open = await page.evaluate(
    ({ title, end }) =>
      new Promise<{ total: number; database: number; read: number; built: number; editor: number }>(
        (resolve, reject) => {
          const button = [...document.querySelectorAll<HTMLButtonElement>('[data-binder-title]')].find(
            (b) => b.textContent === title,
          );
          if (!button) {
            reject(new Error(`No binder button for ${title}`));
            return;
          }
          const old = document.querySelector('.vlo-manuscript');
          let editorAt = 0;
          const start = performance.now();
          button.click();
          // Done when the scene's last words are in the editor and the browser reaches the next frame.
          const check = () => {
            const manuscript = document.querySelector('.vlo-manuscript');
            if (!editorAt && manuscript && manuscript !== old) editorAt = performance.now();
            if (manuscript?.lastElementChild?.textContent.endsWith(end)) {
              // The text is in the page. Stop the clock once the browser has painted it.
              window.__afterPaint(() => {
                resolve({
                  total: performance.now() - start,
                  database: (window.__itemOpenedAt[0] ?? start) - start,
                  read: (window.__itemReadAt[0] ?? start) - start,
                  built: (window.__manuscriptAt[0] ?? start) - start,
                  editor: (editorAt || performance.now()) - start,
                });
              });
            } else requestAnimationFrame(check);
          };
          requestAnimationFrame(check);
        },
      ),
    { title: seeded.longSceneTitle, end: seeded.longSceneEnd },
  );
  const contentVisibility = await page.evaluate(() => CSS.supports('content-visibility', 'auto'));
  console.log(
    `[${browserName}] open the 10,000-word scene from the binder: ${open.total.toFixed(0)} ms ` +
      `(database open at ${open.database.toFixed(0)} ms, updates read at ${open.read.toFixed(0)} ms, ` +
      `editor built at ${open.built.toFixed(0)} ms, first frame with it at ${open.editor.toFixed(0)} ms, ` +
      `content-visibility ${contentVisibility ? 'supported' : 'not supported'})`,
  );
  // The budget is 300 ms. The Linux WebKit build in CI is slower than Safari and varies by up to 200 ms
  // between runs, so it has a 700 ms ceiling that still catches a real slowdown. Real Safari is checked by
  // hand in Phase 6 (product owner decision, 2026-11-03).
  expect(open.total).toBeLessThan(browserName === 'webkit' ? 700 : 300);
  await expect(editor).toBeVisible();

  // Review Focus 6 of Phase 9: Track changes is on, so each key also gets its insert mark.
  await useTool(page, 'Track changes');
  await editor.click();
  await page.keyboard.press('ControlOrMeta+End');
  await page.evaluate(() => {
    window.__keyDelays = [];
  });
  const typed = 'The lamp caught on the third match and light swung out over the water. '
    .repeat(3)
    .slice(0, 200);
  // 30 ms a key is about 400 words a minute: faster than people type, slow enough that keys do not queue.
  await page.keyboard.type(typed, { delay: 30 });
  await expect(editor).toContainText(typed.trim().slice(-30));
  // The last key's frame can come just after its text shows.
  await expect.poll(() => page.evaluate(() => window.__keyDelays.length)).toBe(typed.length);
  const delays = await page.evaluate(() => window.__keyDelays);
  const sorted = [...delays].sort((a, b) => a - b);
  const p95 = sorted[Math.ceil(sorted.length * 0.95) - 1] ?? Infinity;
  console.log(`[${browserName}] keystroke to paint, p95 of ${String(delays.length)}: ${p95.toFixed(1)} ms`);
  // The budget is 50 ms. The Linux WebKit build in CI takes 58 to 65 ms on this 10,000-word scene, so it has
  // a 100 ms ceiling that still catches a real slowdown. Real Safari is checked by hand (product owner decision).
  expect(p95).toBeLessThan(browserName === 'webkit' ? 100 : 50);

  // The scans ran on the scene, so the budget above holds with the marks on screen.
  await expect(editor.locator('.vlo-style').first()).toBeAttached();
  await expect(editor.locator('.vlo-change[data-change="insert"]').first()).toBeAttached();
  await expect(editor.locator('[spellcheck="false"]').first()).toBeAttached();

  const opened = await page.evaluate(() => [...new Set(window.__itemOpens)]);
  expect(opened).toEqual([`vlo-item-${seeded.longSceneId}`]);
});

test('typing stays under 50 ms at p95 in the 10,000-word scene with a pane open beside it', async ({
  page,
  browserName,
  isMobile,
}) => {
  test.skip(isMobile, 'The split view (F39) needs a screen 1024 px wide.');
  test.slow();
  await skipOnboarding(page);
  const seeded = await seedLarge(page);
  await page.goto(`/p/${seeded.projectId}?item=${seeded.longSceneId}&beside=${seeded.projectId}-002`);
  const editor = page.getByRole('textbox', { name: seeded.longSceneTitle });
  await expect(editor).toContainText(seeded.longSceneEnd);
  await expect(
    page.getByRole('region', { name: 'Beside' }).getByRole('textbox', { name: 'Scene 1.1' }),
  ).toBeVisible();

  await editor.click();
  await page.keyboard.press('ControlOrMeta+End');
  await page.evaluate(() => {
    window.__keyDelays = [];
  });
  const typed = 'The lamp caught on the third match and light swung out over the water. '
    .repeat(3)
    .slice(0, 200);
  await page.keyboard.type(typed, { delay: 30 });
  await expect(editor).toContainText(typed.trim().slice(-30));
  await expect.poll(() => page.evaluate(() => window.__keyDelays.length)).toBe(typed.length);
  const sorted = (await page.evaluate(() => window.__keyDelays)).sort((a, b) => a - b);
  const p95 = sorted[Math.ceil(sorted.length * 0.95) - 1] ?? Infinity;
  console.log(`[${browserName}] keystroke to paint with two panes, p95: ${p95.toFixed(1)} ms`);
  // The same budget and WebKit ceiling as Gate 1.
  expect(p95).toBeLessThan(browserName === 'webkit' ? 100 : 50);
});

test('typing stays under 50 ms at p95 with 500 shimmering runs on screen, and the shimmer pauses', async ({
  page,
  browserName,
}) => {
  await skipOnboarding(page);
  await page.getByRole('button', { name: 'New project' }).click();
  await page
    .getByRole('dialog', { name: 'New project' })
    .getByRole('button', { name: 'Create project' })
    .click();
  const editor = page.getByRole('textbox', { name: 'Scene 1' });
  await expect(editor).toBeFocused();

  // 25 paragraphs of 20 filled words, pasted in one go, as a writer would paste formatted text.
  await editor.evaluate((root) => {
    const fill = JSON.stringify({
      stops: [
        { color: '#8a6316', at: 0 },
        { color: '#e8c35a', at: 50 },
        { color: '#7a5512', at: 100 },
      ],
      angle: 90,
      look: 'metallic',
      shimmer: true,
      speed: 4,
    }).replaceAll('"', '&quot;');
    const run = `<span data-fill="${fill}">gold</span>`;
    const html = Array.from(
      { length: 25 },
      () => `<p>${Array.from({ length: 20 }, () => run).join(' ')}</p>`,
    ).join('');
    const data = new DataTransfer();
    data.setData('text/html', html);
    data.setData('text/plain', 'gold');
    const paste = new ClipboardEvent('paste', { bubbles: true, cancelable: true });
    // Firefox ignores clipboardData in the event's options.
    Object.defineProperty(paste, 'clipboardData', { value: data });
    root.dispatchEvent(paste);
  });
  const runs = editor.locator('.vlo-fill-shimmer');
  await expect(runs).toHaveCount(500);
  // A text with fills paints in its own layer, so a key repaints only what changed.
  await expect(editor).toHaveClass(/\bvlo-has-fill\b/);

  const playState = () => runs.first().evaluate((el) => getComputedStyle(el).animationPlayState);
  await expect.poll(playState, { timeout: 4_000 }).toBe('running');

  await page.keyboard.press('ControlOrMeta+End');
  await page.evaluate(() => {
    window.__keyDelays = [];
  });
  const typed = ' and the lamp swung out over the water'.repeat(3).slice(0, 100);
  await page.keyboard.type(typed.slice(0, 10), { delay: 30 });
  // While the writer types, every shimmer waits (plan decision 3).
  expect(await playState()).toBe('paused');
  await page.keyboard.type(typed.slice(10), { delay: 30 });
  await expect.poll(() => page.evaluate(() => window.__keyDelays.length)).toBe(typed.length);
  const delays = await page.evaluate(() => window.__keyDelays);
  const sorted = [...delays].sort((a, b) => a - b);
  const p95 = sorted[Math.ceil(sorted.length * 0.95) - 1] ?? Infinity;
  console.log(`[${browserName}] keystroke to paint with 500 shimmer runs, p95: ${p95.toFixed(1)} ms`);
  // The budget is 50 ms. The Linux WebKit build in CI paints gradient text in software, takes 65 ms with
  // the paint layer and runs up to two times slower on some runners, so it has a 120 ms ceiling. Real Safari
  // is checked by hand before this test's pull request merges (product owner decision, 2026-11-03).
  expect(p95).toBeLessThan(browserName === 'webkit' ? 120 : 50);
  await expect.poll(playState, { timeout: 4_000 }).toBe('running');
});

/* Phase 6 Task F3: the budgets of spec section 12 that Gate 1 did not measure. */

test.describe('a mid-range phone', () => {
  // A cold load: no service worker answers from its cache.
  test.use({ serviceWorkers: 'block', viewport: { width: 412, height: 823 } });

  test('LCP: the Library paints its largest element in under 2.5 s', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'Only Chromium has the CDP throttling.');
    await skipOnboarding(page);
    await seedProjects(page, 3);
    // The Lighthouse mobile profile (plan Global Constraints).
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Network.enable');
    await cdp.send('Network.clearBrowserCache');
    await cdp.send('Network.emulateNetworkConditions', {
      offline: false,
      latency: 150,
      downloadThroughput: (1.6 * 1024 * 1024) / 8,
      uploadThroughput: (750 * 1024) / 8,
    });
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    await page.reload();
    await expect(page.getByRole('heading', { level: 1, name: 'Library' })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText('Seeded project 3')).toBeVisible();
    const lcp = await page.evaluate(
      () =>
        new Promise<number>((resolve) => {
          new PerformanceObserver((list) => {
            resolve(Math.max(...list.getEntries().map((e) => e.startTime)));
          }).observe({ type: 'largest-contentful-paint', buffered: true });
        }),
    );
    console.log(`[${browserName}] Library LCP on a mid-range phone: ${lcp.toFixed(0)} ms`);
    expect(lcp).toBeLessThan(2500);
  });

  test('INP: every screen answers its interactions in under 200 ms', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'Only Chromium has the CDP throttling and interaction ids.');
    test.slow();
    // The observer starts with the page, because the browser keeps only entries over 104 ms for later.
    await page.addInitScript(() => {
      window.__interactions = {};
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries() as PerformanceEventTiming[]) {
          if (entry.interactionId === 0) continue;
          // An interaction takes its longest event, the way INP counts it.
          const key = String(entry.interactionId);
          window.__interactions[key] = Math.max(window.__interactions[key] ?? 0, entry.duration);
        }
      }).observe({ type: 'event', durationThreshold: 16 } as PerformanceObserverInit);
    });
    await skipOnboarding(page);
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    await page.getByRole('button', { name: 'New project' }).click();
    const dialog = page.getByRole('dialog', { name: 'New project' });
    for (const template of [/Memoir/, /Poetry/, /Novel/]) {
      await dialog.getByRole('checkbox', { name: template }).click();
    }
    await dialog.getByRole('button', { name: 'Create project' }).click();
    await expect(page.locator('.vlo-manuscript')).toBeFocused();
    await page.keyboard.type('The harbour lights came on one by one.', { delay: 30 });
    for (const [opener, name] of [
      ['Search', 'Command menu'],
      ['Export', 'Export'],
      ['Share', 'Share for reading'],
      ['Insights', 'Insights'],
      ['History', 'History'],
    ] as const) {
      await page.getByRole('button', { name: opener, exact: true }).click();
      await expect(page.getByRole('dialog', { name })).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(page.getByRole('dialog', { name })).toBeHidden();
    }
    const views = page.getByRole('navigation', { name: 'Project views' });
    for (const view of ['Board', 'Plot Grid', 'Timeline', 'People', 'Sequences', 'Submissions', 'Progress']) {
      await views.getByRole('link', { name: view }).click();
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    }
    await page.getByRole('link', { name: 'Settings' }).click();
    await page.getByRole('switch', { name: 'Calm mode' }).click();
    await page.getByRole('contentinfo').getByRole('link', { name: 'See the network log' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Network log');
    // The last event waits for its next paint before the browser reports it.
    await page.waitForTimeout(500);
    const times = Object.values(await page.evaluate(() => window.__interactions)).sort((a, b) => b - a);
    // INP leaves out the slowest interaction of each 50, so one hiccup in a long visit does not count.
    const inp = times[Math.floor(times.length / 50)] ?? 0;
    console.log(
      `[${browserName}] INP at 4x CPU slowdown: ${inp.toFixed(0)} ms, worst ${(times[0] ?? 0).toFixed(0)} ms, over ${String(times.length)} slow interactions`,
    );
    expect(inp).toBeLessThan(200);
  });
});

test('DOCX: the 100,000-word novel exports in under 10 s and never blocks the main thread', async ({
  page,
  browserName,
}) => {
  test.slow();
  await skipOnboarding(page);
  const seeded = await seedLarge(page);
  await page.goto(`/p/${seeded.projectId}?item=${seeded.longSceneId}`);
  await expect(page.getByRole('textbox', { name: seeded.longSceneTitle })).toBeVisible();
  await page.getByRole('button', { name: 'Export' }).click();
  const dialog = page.getByRole('dialog', { name: 'Export' });
  await dialog.getByRole('radio', { name: /The whole project/ }).click();
  await page.evaluate(() => {
    window.__longTasks = [];
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) window.__longTasks.push(entry.duration);
    }).observe({ type: 'longtask' });
  });
  const download = page.waitForEvent('download', { timeout: 30_000 });
  const start = Date.now();
  await dialog.getByRole('button', { name: 'Export', exact: true }).click();
  const file = await download;
  const took = Date.now() - start;
  const longest = Math.max(0, ...(await page.evaluate(() => window.__longTasks)));
  console.log(
    `[${browserName}] DOCX of 100,000 words: ${String(took)} ms, longest main-thread task ${longest.toFixed(0)} ms`,
  );
  expect(file.suggestedFilename()).toMatch(/\.docx$/);
  // The file holds the whole novel, not only the open scene.
  const xml =
    (await (
      await JSZip.loadAsync(await readFile(await file.path()))
    )
      .file('word/document.xml')
      ?.async('string')) ?? '';
  expect(xml).toContain(seeded.longSceneEnd);
  expect(xml.length).toBeGreaterThan(500_000);
  expect(took).toBeLessThan(10_000);
  // Only Chromium reports long tasks. Elsewhere the time budget still holds.
  if (await page.evaluate(() => PerformanceObserver.supportedEntryTypes.includes('longtask')))
    expect(longest).toBeLessThan(200);
});
