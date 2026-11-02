import { expect, test } from '@playwright/test';
import { skipOnboarding } from './support/onboarding';
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
  const seeded = await seedLarge(page);

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
  expect(open.total).toBeLessThan(300);
  await expect(editor).toBeVisible();

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
  expect(p95).toBeLessThan(50);

  const opened = await page.evaluate(() => [...new Set(window.__itemOpens)]);
  expect(opened).toEqual([`vlo-item-${seeded.longSceneId}`]);
});
