import { expect, test, type Page } from '@playwright/test';
import { seriousIssues } from './support/axe';
import { BUNDLE, fakeSupabase, shareOf } from './support/share';

/*
 * Phase 6 Task F2 (spec section 12): axe on every route in each theme, and a visible focus ring on every
 * control that Tab reaches. One project holds all 3 templates, so it has every project view.
 */

// Playwright routes the fake Supabase requests only in Chromium once the service worker controls the
// page, so these tests run with no service worker. The PWA tests cover the worker.
test.use({ serviceWorkers: 'block' });

const THEMES = ['ink', 'paper', 'sepia', 'contrast'] as const;
const VIEWS = ['Board', 'Plot Grid', 'Timeline', 'People', 'Sequences', 'Submissions', 'Progress'];
const PAGES = ['/', '/settings', '/network', '/ai-policy', '/privacy', '/help', '/verify', '/nope'];

async function setTheme(page: Page, theme: (typeof THEMES)[number]) {
  await page.addInitScript((t) => {
    localStorage.setItem('vlo:preferences', JSON.stringify({ theme: t, calm: false }));
  }, theme);
}

const heading = (page: Page) => page.getByRole('heading', { level: 1 });

/** Makes a project with the Novel, Memoir and Poetry templates, and gives its path. */
async function newMixedProject(page: Page): Promise<string> {
  await page.getByRole('button', { name: 'New project' }).click();
  const dialog = page.getByRole('dialog', { name: 'New project' });
  // The first pick replaces the suggested Novel, so Novel comes last.
  for (const template of [/Memoir/, /Poetry/, /Novel/]) {
    await dialog.getByRole('checkbox', { name: template }).click();
  }
  await dialog.getByRole('button', { name: 'Create project' }).click();
  // The new item's editor takes the focus once it loads. The checks wait for that.
  await expect(page.locator('.vlo-manuscript')).toBeFocused();
  return new URL(page.url()).pathname;
}

/** Visits every route once, from a fresh profile, and calls `visit` on each. */
async function eachRoute(page: Page, visit: (route: string) => Promise<void>) {
  await page.goto('/welcome');
  await expect(heading(page)).toBeVisible();
  await visit('/welcome');
  await page.getByRole('button', { name: 'Skip' }).click();
  await expect(heading(page)).toHaveText('Library');
  const project = await newMixedProject(page);
  await visit(project);
  for (const view of VIEWS) {
    await page.getByRole('navigation', { name: 'Project views' }).getByRole('link', { name: view }).click();
    await expect(page.getByRole('link', { name: view })).toHaveAttribute('aria-current', 'page');
    await visit(`${project} ${view}`);
  }
  // A new writer has the Simple tool level, so the Outline, Codex and Book tabs show only on their own screens.
  await page.goto(`${project}/outline`);
  await expect(page.getByRole('heading', { level: 2, name: 'Outline' })).toBeVisible();
  await visit(`${project} Outline`);
  await page.goto(`${project}/codex`);
  await expect(page.getByRole('heading', { level: 2, name: 'Codex' })).toBeVisible();
  await visit(`${project} Codex`);
  await page.goto(`${project}/book`);
  await expect(page.getByRole('heading', { level: 2, name: 'Book' })).toBeVisible();
  await expect(page.getByRole('img', { name: 'Page 1' })).toBeVisible();
  await visit(`${project} Book`);
  for (const path of PAGES) {
    await page.goto(path);
    await expect(heading(page)).toBeVisible();
    await visit(path);
  }
  const share = await shareOf(await fakeSupabase(page.context()), BUNDLE);
  await page.goto(share.path);
  await expect(heading(page)).toHaveText(BUNDLE.title);
  await visit('/r/:shareId');
}

for (const theme of THEMES) {
  test(`every route has no serious axe issues in ${theme}`, async ({ page }) => {
    test.setTimeout(120_000);
    await setTheme(page, theme);
    const found: Record<string, string[]> = {};
    await eachRoute(page, async (route) => {
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      const issues = await seriousIssues(page);
      if (issues.length > 0) found[route] = issues;
    });
    expect(found).toEqual({});
  });
}

/** The main dialogs of a project, by the name of the button that opens each one and the dialog's name. */
const DIALOGS: [opener: string | RegExp, dialog: string][] = [
  ['Search', 'Command menu'],
  ['Export', 'Export'],
  ['Share', 'Share for reading'],
  [/^AI mode: /, 'AI mode'],
  ['Insights', 'Insights'],
  ['History', 'History'],
];

for (const theme of THEMES) {
  test(`each main dialog has no serious axe issues in ${theme}, and Escape gives the focus back`, async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await setTheme(page, theme);
    await page.goto('/welcome');
    await page.getByRole('button', { name: 'Skip' }).click();
    const found: Record<string, string[]> = {};
    const check = async (opener: ReturnType<Page['getByRole']>, name: string) => {
      await opener.click();
      const dialog = page.getByRole('dialog', { name });
      await expect(dialog).toBeVisible();
      const issues = await seriousIssues(page);
      if (issues.length > 0) found[name] = issues;
      await page.keyboard.press('Escape');
      await expect(dialog).toBeHidden();
      await expect(opener).toBeFocused();
    };
    await check(page.getByRole('button', { name: 'New project' }), 'New project');
    await newMixedProject(page);
    for (const [opener, name] of DIALOGS) {
      await check(page.getByRole('button', { name: opener, exact: true }), name);
    }
    expect(found).toEqual({});
  });
}

test('every control that Tab reaches shows a focus ring', async ({ page }) => {
  test.setTimeout(120_000);
  const found: Record<string, string[]> = {};
  await eachRoute(page, async (route) => {
    // A key press makes the browser treat the next focus() calls as keyboard focus (:focus-visible).
    await page.keyboard.press('Shift');
    const unringed = await page.evaluate(async () => {
      const missing: string[] = [];
      // The manuscript shows its caret as its focus mark, so it has no ring (editor.css) and is left out.
      const focusable = [
        ...document.querySelectorAll<HTMLElement>(
          'a[href], button:enabled, input:enabled, select:enabled, textarea:enabled, [tabindex]:not([tabindex="-1"])',
        ),
      ].filter(
        (el) => !el.isContentEditable && !el.closest('[inert], [aria-hidden="true"]') && el.checkVisibility(),
      );
      for (const el of focusable) {
        // A toolbar passes its focus on to an item, so each element starts from no focus.
        (document.activeElement as HTMLElement | null)?.blur();
        const shadow = getComputedStyle(el).boxShadow;
        // Firefox shows a focus-visible ring after a script focus only when asked.
        el.focus({ focusVisible: true });
        await new Promise((resolve) => requestAnimationFrame(resolve));
        if (document.activeElement !== el) continue;
        // Some rings fade in, so the check reads the style after the transition ends.
        await Promise.all(el.getAnimations().map((a) => a.finished.catch(() => undefined)));
        // A ring is an outline, or a box shadow that the focus adds.
        const style = getComputedStyle(el);
        const outline = style.outlineStyle !== 'none' && parseFloat(style.outlineWidth) > 0;
        if (!outline && style.boxShadow === shadow) {
          missing.push(el.getAttribute('aria-label') ?? el.textContent.trim().slice(0, 40));
        }
      }
      return missing;
    });
    if (unringed.length > 0) found[route] = unringed;
  });
  expect(found).toEqual({});
});
