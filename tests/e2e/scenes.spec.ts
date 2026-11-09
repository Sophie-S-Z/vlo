import { expect, test, type Page } from '@playwright/test';
import { seriousIssues } from './support/axe';
import { editorSelection } from './support/selection';
import { skipOnboarding } from './support/onboarding';

/*
 * Task A8: cozy scenes. A scene fills the space around the page, moves only while the writer rests, stays
 * still in Calm mode and with reduced motion, and belongs to the project.
 */

declare global {
  interface Window {
    __keyDelays: number[];
  }
}

const text = (page: Page) => page.getByRole('textbox', { name: 'Scene 1' });
const backdrop = (page: Page) => page.locator('.vlo-scene');
const picker = (page: Page) => page.getByRole('button', { name: /^Scene:/ });

async function newNovel(page: Page) {
  await skipOnboarding(page);
  await page.getByRole('button', { name: 'New project' }).click();
  await page
    .getByRole('dialog', { name: 'New project' })
    .getByRole('button', { name: 'Create project' })
    .click();
  await expect(text(page)).toBeFocused();
}

/** Types the text one key every 30 ms and returns each key's time from keydown to paint. */
async function typeAndTime(page: Page, typed: string): Promise<number[]> {
  await page.evaluate(() => {
    window.__keyDelays = [];
  });
  await page.keyboard.type(typed, { delay: 30 });
  await expect.poll(() => page.evaluate(() => window.__keyDelays.length)).toBe(typed.length);
  return page.evaluate(() => window.__keyDelays);
}

async function pickScene(page: Page, name: string) {
  await picker(page).click();
  await page.getByRole('radiogroup', { name: 'Scene' }).getByRole('radio', { name }).click();
  await page.keyboard.press('Escape');
  try {
    await expect(page.getByRole('radiogroup', { name: 'Scene' })).toBeHidden();
  } catch (error) {
    // A record for the CI log: why the panel stayed open.
    const state = await page.evaluate(() => {
      const panel = document.querySelector('[role="dialog"]');
      return {
        state: panel?.getAttribute('data-state'),
        animations: panel?.getAnimations().map((a) => `${a.playState} ${String(a.currentTime)}`),
        focus: `${document.activeElement?.tagName ?? ''} ${document.activeElement?.getAttribute('aria-label') ?? ''}`,
      };
    });
    console.log(`scene panel after Escape: ${JSON.stringify(state)}`);
    throw error;
  }
}

test('a scene shows around the page, rests while the writer types, and stays after a reload', async ({
  page,
}) => {
  const workers: string[] = [];
  page.on('worker', (worker) => workers.push(worker.url()));
  await newNovel(page);
  await page.keyboard.type('The rain began.');
  await expect(text(page)).toContainText('The rain began.');
  await expect(backdrop(page)).toHaveCount(0);

  await pickScene(page, 'Rainy window');
  await expect(picker(page)).toHaveAccessibleName('Scene: Rainy window');
  await expect(text(page)).toContainText('The rain began.');
  await expect(backdrop(page)).toHaveAttribute('data-scene', 'rain');
  await expect(backdrop(page)).toHaveAttribute('aria-hidden', 'true');
  await expect(backdrop(page)).toHaveAttribute('data-moving', 'true', { timeout: 5_000 });
  // Browsers that can hand a canvas to a worker draw the scene off the main thread.
  const offscreen = await page.evaluate(() => 'transferControlToOffscreen' in HTMLCanvasElement.prototype);
  if (offscreen) expect(workers.some((url) => url.includes('scene.worker'))).toBe(true);

  // The scene rests from the first key until the writer pauses.
  // The caret is after the last word before the next key goes in. See editorSelection.
  await expect(async () => {
    await text(page).click();
    await page.keyboard.press('ControlOrMeta+End');
    await expect
      .poll(async () => (await editorSelection(text(page))).from, { timeout: 1_000 })
      .toBe('The rain began.'.length + 1);
  }).toPass();
  await page.keyboard.type(' It kept on.');
  await expect(text(page)).toContainText('The rain began. It kept on.');
  await expect(backdrop(page)).toHaveAttribute('data-moving', 'false');
  await expect(backdrop(page)).toHaveAttribute('data-moving', 'true', { timeout: 5_000 });

  // The page sits on the scene and stays readable: its own background, above the scene.
  const layers = await page.evaluate(() => {
    const sheet = document.querySelector('.vlo-scene-page');
    const art = document.querySelector('.vlo-scene');
    if (!sheet || !art) return null;
    // The point must be on the screen, and Firefox scrolls the window to the caret.
    sheet.scrollIntoView({ block: 'start' });
    const box = sheet.getBoundingClientRect();
    const top = document.elementFromPoint(box.left + box.width / 2, box.top + 20);
    return {
      pageOnTop: sheet.contains(top),
      top: top ? `${top.tagName} ${top.className}` : 'none',
      background: getComputedStyle(sheet).backgroundColor,
    };
  });
  // The whole object prints on a failure, so it names the element on top.
  expect(layers).toMatchObject({ pageOnTop: true });
  expect(layers?.background).not.toBe('rgba(0, 0, 0, 0)');

  await page.reload();
  await expect(text(page)).toContainText('The rain began. It kept on.');
  await expect(backdrop(page)).toHaveAttribute('data-scene', 'rain');
  await expect(picker(page)).toHaveAccessibleName('Scene: Rainy window');

  await pickScene(page, 'No scene');
  await expect(backdrop(page)).toHaveCount(0);
  await expect(picker(page)).toHaveAccessibleName('Scene: No scene');
  await page.reload();
  await expect(text(page)).toBeVisible();
  await expect(backdrop(page)).toHaveCount(0);
});

test('with reduced motion or a hidden tab the scene stays still, and it moves again after', async ({
  page,
}) => {
  await newNovel(page);
  await pickScene(page, 'Night sky');
  await expect(backdrop(page)).toHaveAttribute('data-moving', 'true', { timeout: 5_000 });

  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(backdrop(page)).toHaveAttribute('data-moving', 'false');
  await picker(page).click();
  await expect(page.getByText('Calm mode or reduced motion is on, so the scene stays still.')).toBeVisible();
  await page.keyboard.press('Escape');

  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await expect(backdrop(page)).toHaveAttribute('data-moving', 'true', { timeout: 5_000 });

  // A hidden tab stops the scene too.
  const setHidden = (hidden: boolean) =>
    page.evaluate((value) => {
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => value });
      document.dispatchEvent(new Event('visibilitychange'));
    }, hidden);
  await setHidden(true);
  await expect(backdrop(page)).toHaveAttribute('data-moving', 'false');
  await setHidden(false);
  await expect(backdrop(page)).toHaveAttribute('data-moving', 'true');
});

test('on a device that draws the scene slowly, the scene goes still, says why, and can try again', async ({
  page,
}) => {
  await newNovel(page);
  await pickScene(page, 'Night sky');
  await expect(backdrop(page)).toHaveAttribute('data-moving', 'true', { timeout: 5_000 });

  // Each frame takes 120 ms of main-thread work, as on a slow device.
  await page.evaluate(() => {
    const w = window as unknown as { __slowFrames: boolean };
    w.__slowFrames = true;
    const busy = () => {
      if (!w.__slowFrames) return;
      const end = performance.now() + 120;
      while (performance.now() < end) {
        // Hold the main thread.
      }
      requestAnimationFrame(busy);
    };
    requestAnimationFrame(busy);
  });
  await expect(backdrop(page)).toHaveAttribute('data-still', 'slow', { timeout: 10_000 });
  await expect(backdrop(page)).toHaveAttribute('data-moving', 'false');
  await page.evaluate(() => {
    (window as unknown as { __slowFrames: boolean }).__slowFrames = false;
  });

  await picker(page).click();
  const scenePanel = page.getByRole('dialog', { name: 'Scene' });
  await expect(scenePanel.getByRole('status')).toHaveText(
    /This device drew the moving scene slowly, so the scene stays still and your typing stays quick\./,
  );
  await scenePanel.getByRole('button', { name: 'Try the motion again' }).click();
  await expect(backdrop(page)).toHaveAttribute('data-moving', 'true');
  await expect(backdrop(page)).not.toHaveAttribute('data-still', 'slow');
  await expect(scenePanel.getByRole('status')).toHaveCount(0);
});

test('in Calm mode the scene is a still picture', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('vlo:preferences', JSON.stringify({ theme: 'system', calm: true }));
  });
  await newNovel(page);
  await pickScene(page, 'Forest');
  await expect(backdrop(page)).toHaveAttribute('data-scene', 'forest');
  // Wait past the typing pause, so only Calm mode can hold the scene still.
  await page.waitForTimeout(2_000);
  await expect(backdrop(page)).toHaveAttribute('data-moving', 'false');
  // The still picture shows at once, before and under the canvas.
  expect(await backdrop(page).evaluate((el) => getComputedStyle(el).backgroundImage)).toMatch(/gradient/);
});

test('the scene picker has no serious axe issues, and a scene adds no horizontal scroll at 360 px', async ({
  page,
}) => {
  await newNovel(page);
  await page.keyboard.type('Ink and paper.');
  // The word count rolls in after the save, so axe waits for it.
  await expect(page.getByText('3 words', { exact: true })).toBeVisible();
  await pickScene(page, 'Ocean at dusk');
  await picker(page).click();
  await expect(page.getByRole('radiogroup', { name: 'Scene' })).toBeVisible();
  expect(await seriousIssues(page)).toEqual([]);
  await page.keyboard.press('Escape');

  await page.setViewportSize({ width: 360, height: 740 });
  await expect(backdrop(page)).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});

// The budget is 50 ms. The CI WebKit paints in software and gets a 150 ms ceiling (product owner choice,
// 2026-11-04). Real Safari is checked by hand against 50 ms.
test('typing with a moving scene stays under 50 ms at p95', async ({ page, browserName }) => {
  const ceiling = browserName === 'webkit' ? 150 : 50;
  await page.addInitScript(() => {
    window.__keyDelays = [];
    window.addEventListener(
      'keydown',
      (event) => {
        if (event.key.length !== 1) return;
        const start = event.timeStamp;
        // A message posted in the frame callback runs after that frame's style, layout and paint.
        requestAnimationFrame(() => {
          const channel = new MessageChannel();
          channel.port1.onmessage = () => {
            window.__keyDelays.push(performance.now() - start);
          };
          channel.port2.postMessage(null);
        });
      },
      true,
    );
  });
  await newNovel(page);
  await pickScene(page, 'Fireplace');
  await expect(backdrop(page)).toHaveAttribute('data-moving', 'true', { timeout: 5_000 });
  // A record for the CI log: how long main-thread frames take while the scene moves.
  const frames = await page.evaluate(
    () =>
      new Promise<{ median: number; worst: number; offscreen: boolean }>((resolve) => {
        const gaps: number[] = [];
        let last = performance.now();
        const step = (now: number) => {
          gaps.push(now - last);
          last = now;
          if (gaps.length < 60) requestAnimationFrame(step);
          else {
            gaps.sort((a, b) => a - b);
            resolve({
              median: gaps[30] ?? 0,
              worst: gaps[59] ?? 0,
              offscreen: 'transferControlToOffscreen' in HTMLCanvasElement.prototype,
            });
          }
        };
        requestAnimationFrame(step);
      }),
  );
  console.log(
    `[${browserName}] frames with a moving scene: median ${frames.median.toFixed(1)} ms, worst ${frames.worst.toFixed(1)} ms, worker canvas ${String(frames.offscreen)}`,
  );

  await text(page).click();
  await page.evaluate(() => {
    window.__keyDelays = [];
  });
  const typed = 'The fire settled and the room went gold at the edges. '.repeat(2).slice(0, 100);
  const delays = await typeAndTime(page, typed);
  const sorted = [...delays].sort((a, b) => a - b);
  const p95 = sorted[Math.ceil(sorted.length * 0.95) - 1] ?? Infinity;
  console.log(`[${browserName}] keystroke to paint with a scene, p95: ${p95.toFixed(1)} ms`);
  // A record for the CI log: the slowest keys and where they fell in the typing.
  const slowest = delays
    .map((delay, index) => ({ delay, index }))
    .sort((a, b) => b.delay - a.delay)
    .slice(0, 8)
    .map(({ delay, index }) => `#${String(index)} ${delay.toFixed(0)} ms`);
  console.log(`[${browserName}] slowest keys with a scene: ${slowest.join(', ')}`);
  expect(p95).toBeLessThan(ceiling);
});
