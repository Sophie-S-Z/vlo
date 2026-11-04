import { expect, test, type Locator, type Page } from '@playwright/test';
import { seriousIssues } from './support/axe';
import { skipOnboarding } from './support/onboarding';
import { useTool } from './support/tools';

/* Task A6: equations. A writer builds them with buttons and keys, never with LaTeX, and they survive a reload. */

const scene = (page: Page) => page.getByRole('textbox', { name: 'Scene 1' });
const poem = (page: Page) => page.getByRole('textbox', { name: 'Poem 1' });
const panel = (page: Page) => page.getByRole('dialog', { name: 'Equation' });
const field = (page: Page) => panel(page).locator('math-field');
const HALF = /^\\frac(12|\{1\}\{2\})$/;

async function newProject(page: Page, kind: 'novel' | 'poetry') {
  await skipOnboarding(page);
  await page.getByRole('button', { name: 'New project' }).click();
  const dialog = page.getByRole('dialog', { name: 'New project' });
  if (kind === 'poetry') await dialog.getByRole('radio', { name: /Poetry collection/ }).click();
  await dialog.getByRole('button', { name: 'Create project' }).click();
  await expect(kind === 'poetry' ? poem(page) : scene(page)).toBeFocused();
}

/** Requests to any origin other than the app's, and CSP violations, from now on. */
function watchOutside(page: Page, app: string): { requests: string[]; violations: string[] } {
  const seen = { requests: [] as string[], violations: [] as string[] };
  const origin = new URL(app).origin;
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (!['http:', 'https:'].includes(url.protocol)) return;
    if (url.origin !== origin) seen.requests.push(url.href);
  });
  page.on('console', (msg) => {
    if (/Content Security Policy|CSP violation/i.test(msg.text())) seen.violations.push(msg.text());
  });
  return seen;
}

/** The text of a line without the drawn equations, so its spaces can be checked. */
const textAround = (line: Locator) =>
  line.evaluate((el) => {
    const copy = el.cloneNode(true) as HTMLElement;
    for (const math of copy.querySelectorAll('[data-math-inline]')) math.replaceWith('[math]');
    return copy.textContent;
  });

test('a writer builds a fraction with the Fraction button and number keys, and it survives a reload', async ({
  page,
  baseURL,
}) => {
  const outside = watchOutside(page, baseURL ?? 'http://localhost:4173');
  await page.addInitScript(() => {
    document.addEventListener('securitypolicyviolation', (e) => {
      console.error(`CSP violation: ${e.violatedDirective} ${e.blockedURI}`);
    });
  });
  await newProject(page, 'novel');
  await page.keyboard.type('Half the town slept: ');

  await useTool(page, 'Equation');
  await expect(panel(page)).toBeVisible();
  await expect(field(page)).toBeFocused();
  await panel(page).getByRole('button', { name: 'Fraction' }).click();
  await page.keyboard.type('1');
  // Tab moves to the next empty box of the fraction.
  await page.keyboard.press('Tab');
  await page.keyboard.type('2');
  // The LaTeX stays hidden until the writer asks for it.
  await expect(panel(page).getByLabel('LaTeX', { exact: true })).toHaveCount(0);

  // Enter returns to the text, just after the equation.
  await page.keyboard.press('Enter');
  await expect(panel(page)).toBeHidden();
  await expect(scene(page)).toBeFocused();
  await page.keyboard.type(' and dreamed.');
  const math = scene(page).locator('[data-math-inline]');
  // MathLive writes a fraction of two digits in its short form.
  await expect(math).toHaveAttribute('data-latex', HALF);
  await expect(math.locator('.ML__latex')).toBeVisible();
  // Screen readers hear the equation in words.
  await expect(math).toHaveAttribute('aria-label', 'Equation: half');
  await expect
    .poll(() => textAround(scene(page).locator('p').first()))
    .toBe('Half the town slept: [math] and dreamed.');

  await expect(page.getByRole('status').filter({ hasText: /Saved/ })).toHaveText('Saved');
  await page.reload();
  await expect(scene(page).locator('[data-math-inline]')).toHaveAttribute('data-latex', HALF);
  await expect(scene(page).locator('[data-math-inline] .ML__latex')).toBeVisible();

  // Pen mode: MathLive, its fonts and its keyboard come from the app itself.
  expect(outside.requests).toEqual([]);
  expect(outside.violations).toEqual([]);
});

test('a click opens an equation; Show LaTeX shows and edits its code; Escape drops an empty one', async ({
  page,
}) => {
  await newProject(page, 'novel');
  await page.keyboard.type('Energy is ');
  await page.keyboard.type('/equation');
  await expect(
    page.getByRole('listbox', { name: 'Tools' }).getByRole('option', { name: /^Equation$/ }),
  ).toBeVisible();
  await page.keyboard.press('Enter');
  await expect(field(page)).toBeFocused();
  await page.keyboard.type('mc^2');
  await page.keyboard.press('Enter');
  await expect(scene(page).locator('[data-math-inline]')).toHaveAttribute('data-latex', 'mc^2');

  // A click on the equation opens it again.
  await scene(page).locator('[data-math-inline]').click();
  await expect(field(page)).toBeFocused();
  await panel(page).getByLabel('Show LaTeX').click();
  const code = panel(page).getByLabel('LaTeX', { exact: true });
  await expect(code).toHaveValue('mc^2');
  await code.fill('E=mc^2');
  await expect(scene(page).locator('[data-math-inline]')).toHaveAttribute('data-latex', 'E=mc^2');
  await panel(page).getByRole('button', { name: 'Done' }).click();
  await expect(panel(page)).toBeHidden();
  await expect(scene(page)).toBeFocused();

  // An equation left empty goes away when its panel closes.
  await page.keyboard.press('End');
  await useTool(page, 'Equation');
  await expect(field(page)).toBeFocused();
  await expect(scene(page).locator('[data-math-inline]')).toHaveCount(2);
  await page.keyboard.press('Escape');
  await expect(panel(page)).toBeHidden();
  await expect(scene(page).locator('[data-math-inline]')).toHaveCount(1);
  await expect(scene(page)).toBeFocused();

  // Escape right after a key keeps that key.
  await useTool(page, 'Equation');
  await expect(field(page)).toBeFocused();
  await page.keyboard.type('k');
  await page.keyboard.press('Escape');
  await expect(panel(page)).toBeHidden();
  await expect(scene(page).locator('[data-math-inline]').last()).toHaveAttribute('data-latex', 'k');
});

test('a poem line with an equation keeps its hanging indent and its spaces after a reload', async ({
  page,
}) => {
  await newProject(page, 'poetry');
  await page.keyboard.type('Count   the stars:  ');
  for (let i = 0; i < 3; i++) await useTool(page, 'More hanging indent');
  const line = poem(page).locator('[data-poem-line]').first();
  await expect(line).toHaveAttribute('data-hanging', '3');
  const before = await line.evaluate((el) => {
    const style = getComputedStyle(el);
    return { padding: style.paddingLeft, indent: style.textIndent, space: style.whiteSpace };
  });

  await page.keyboard.type('/equation');
  await page.keyboard.press('Enter');
  await expect(field(page)).toBeFocused();
  await panel(page).getByRole('button', { name: 'Calculus' }).click();
  await panel(page).getByRole('button', { name: 'Infinity' }).click();
  await page.keyboard.press('Enter');
  await page.keyboard.type('  and more');

  const check = async () => {
    const after = poem(page).locator('[data-poem-line]').first();
    await expect(after.locator('[data-math-inline]')).toHaveAttribute('data-latex', '\\infty');
    await expect.poll(() => textAround(after)).toBe('Count   the stars:  [math]  and more');
    expect(
      await after.evaluate((el) => {
        const style = getComputedStyle(el);
        return { padding: style.paddingLeft, indent: style.textIndent, space: style.whiteSpace };
      }),
    ).toEqual(before);
  };
  await check();
  await expect(page.getByRole('status').filter({ hasText: /Saved/ })).toHaveText('Saved');
  await page.reload();
  await check();
});

test('the equation panel has no serious axe issues', async ({ page }) => {
  await newProject(page, 'novel');
  await page.keyboard.type('Area: ');
  await useTool(page, 'Equation');
  await expect(field(page)).toBeFocused();
  await page.keyboard.type('r');
  await panel(page).getByRole('button', { name: 'Power' }).click();
  await page.keyboard.type('2');
  expect(await seriousIssues(page)).toEqual([]);
});
