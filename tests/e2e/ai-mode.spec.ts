import { expect, test, type Page } from '@playwright/test';
import { seriousIssues } from './support/axe';
import { skipOnboarding } from './support/onboarding';
import { openView } from './support/views';

/*
 * Plan Task D2 (spec section 10, F23): the AI mode badge on every project screen, the mode dialog that
 * explains each change away from Pen, the switch back to Pen with no confirm, and the icon morph.
 */

const badge = (page: Page) => page.getByRole('button', { name: /^AI mode: / });
const dialog = (page: Page) => page.getByRole('dialog', { name: 'AI mode' });
const views = (page: Page) => page.getByRole('navigation', { name: 'Project views' });

async function newProject(page: Page, template: 'Novel' | 'Memoir' = 'Novel') {
  await skipOnboarding(page);
  await page.getByRole('button', { name: 'New project' }).click();
  const create = page.getByRole('dialog', { name: 'New project' });
  await create.getByRole('checkbox', { name: new RegExp(template) }).click();
  await create.getByRole('button', { name: 'Create project' }).click();
  await expect(page.getByRole('main').getByRole('textbox').first()).toBeFocused();
}

/** Records each shape of the badge icon from now on. */
async function watchIcon(page: Page) {
  await page.evaluate(() => {
    const path = document.querySelector('[data-testid="mode-badge"] path');
    const seen: string[] = [];
    (window as unknown as { __shapes: string[] }).__shapes = seen;
    if (!path) return;
    new MutationObserver(() => {
      seen.push(path.getAttribute('d') ?? '');
    }).observe(path, { attributes: true, attributeFilter: ['d'] });
  });
}

const shapes = (page: Page) => page.evaluate(() => (window as unknown as { __shapes: string[] }).__shapes);

/** Opens the dialog, picks a mode and switches, and gives the shape of that mode's icon. */
async function switchTo(page: Page, label: 'Reader' | 'Co-writer') {
  await badge(page).click();
  await dialog(page)
    .getByRole('radio', { name: new RegExp(`^${label}`) })
    .click();
  const shape = await dialog(page)
    .getByRole('radio', { name: new RegExp(`^${label}`) })
    .locator('path')
    .getAttribute('d');
  await dialog(page)
    .getByRole('button', { name: `Switch to ${label} mode` })
    .click();
  await expect(dialog(page)).toHaveCount(0);
  await expect(badge(page)).toHaveAccessibleName(`AI mode: ${label}`);
  return shape ?? '';
}

test('the badge shows Pen on every project screen, and a change away from Pen explains itself first', async ({
  page,
}) => {
  await newProject(page);
  await expect(badge(page)).toHaveAccessibleName('AI mode: Pen');
  for (const view of ['Board', 'Plot Grid', 'Submissions', 'Progress']) {
    await views(page).getByRole('link', { name: view, exact: true }).click();
    await expect(views(page).getByRole('link', { name: view, exact: true })).toHaveAttribute(
      'aria-current',
      'page',
    );
    await expect(badge(page)).toHaveAccessibleName('AI mode: Pen');
  }
  await views(page).getByRole('link', { name: 'Write', exact: true }).click();

  await badge(page).click();
  await expect(dialog(page)).toContainText('is in Pen mode');
  await expect(dialog(page).getByRole('radio', { name: /^Pen/ })).toBeChecked();
  await expect(dialog(page).getByTestId('mode-changes')).toHaveCount(0);
  await expect(dialog(page).getByRole('button', { name: 'Close' })).toBeVisible();

  await dialog(page)
    .getByRole('radio', { name: /^Reader/ })
    .click();
  const changes = dialog(page).getByTestId('mode-changes');
  await expect(changes.getByRole('heading', { name: 'What changes in Reader mode' })).toBeVisible();
  await expect(changes).toContainText('Nothing leaves this device until you ask for something.');
  await expect(changes).toContainText('Answers stay in the panel and never enter your manuscript.');
  await expect(changes).not.toContainText('aliases');
  expect(await seriousIssues(page)).toEqual([]);

  // Cancel keeps Pen.
  await dialog(page).getByRole('button', { name: 'Cancel' }).click();
  await expect(dialog(page)).toHaveCount(0);
  await expect(badge(page)).toBeFocused();
  await expect(badge(page)).toHaveAccessibleName('AI mode: Pen');

  await switchTo(page, 'Reader');
  await expect(badge(page)).toBeFocused();
  await page.reload();
  await expect(badge(page)).toHaveAccessibleName('AI mode: Reader');
  await openView(page, 'Progress');
  // The Write screen stays up while Progress loads. The badge click must reach the Progress screen.
  await expect(views(page).getByRole('link', { name: 'Progress', exact: true })).toHaveAttribute(
    'aria-current',
    'page',
  );
  await expect(badge(page)).toHaveAccessibleName('AI mode: Reader');

  await switchTo(page, 'Co-writer');
  await expect(badge(page)).toHaveAttribute('data-mode', 'cowriter');
  expect(await seriousIssues(page)).toEqual([]);

  // The network log counts the mode of this project.
  await page.getByRole('link', { name: 'See the network log' }).click();
  await expect(page.getByTestId('network-count')).toContainText('1 in Co-writer mode');
});

test('a switch back to Pen from the command menu needs no confirm', async ({ page }) => {
  await newProject(page);
  await switchTo(page, 'Reader');
  await page.getByRole('main').getByRole('textbox').first().click();
  await page.keyboard.press('ControlOrMeta+k');
  const menu = page.getByRole('dialog', { name: 'Command menu' });
  await menu.getByRole('combobox').fill('pen mode');
  await menu.getByRole('option', { name: 'Turn off AI (Pen mode)' }).click();
  await expect(badge(page)).toHaveAccessibleName('AI mode: Pen');
  await expect(dialog(page)).toHaveCount(0);

  await page.keyboard.press('ControlOrMeta+k');
  await menu.getByRole('combobox').fill('ai mode');
  await expect(menu.getByRole('option', { name: 'Turn off AI (Pen mode)' })).toHaveCount(0);
  await menu.getByRole('option', { name: 'Change AI mode…' }).click();
  await expect(dialog(page)).toBeVisible();
  await expect(dialog(page).getByRole('radio', { name: /^Pen/ })).toBeFocused();
});

test('a memoir explains that its requests carry aliases', async ({ page }) => {
  await newProject(page, 'Memoir');
  await badge(page).click();
  await dialog(page)
    .getByRole('radio', { name: /^Co-writer/ })
    .click();
  const changes = dialog(page).getByTestId('mode-changes');
  await expect(changes).toContainText('This memoir sends aliases, never real names.');
  await expect(changes).toContainText('Vlo marks each AI word.');
});

test('the badge icon morphs, and Calm mode swaps it at once', async ({ page }) => {
  await newProject(page);
  await watchIcon(page);
  const reader = await switchTo(page, 'Reader');
  await expect.poll(async () => (await shapes(page)).at(-1)).toBe(reader);
  // The morph passes through shapes between the pen and the eye.
  expect((await shapes(page)).length).toBeGreaterThan(3);

  await page.evaluate(() => {
    localStorage.setItem('vlo:preferences', JSON.stringify({ theme: 'system', calm: true }));
  });
  await page.reload();
  await expect(badge(page)).toHaveAccessibleName('AI mode: Reader');
  await watchIcon(page);
  const cowriter = await switchTo(page, 'Co-writer');
  await expect.poll(async () => (await shapes(page)).at(-1)).toBe(cowriter);
  expect(await shapes(page)).toEqual([cowriter]);
});

test('the badge fits next to the tabs on a 360 px screen', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  await newProject(page);
  const box = await badge(page).boundingBox();
  expect(box && box.x >= 0 && box.x + box.width <= 360).toBe(true);
  expect(box && box.height >= 44).toBe(true);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
  await badge(page).click();
  const panel = await dialog(page).boundingBox();
  expect(panel && panel.x >= 0 && panel.x + panel.width <= 360).toBe(true);
});

for (const theme of ['ink', 'paper', 'sepia'] as const) {
  test(`the badge in each mode and the dialog have no serious axe issues in ${theme}`, async ({ page }) => {
    await page.addInitScript((t) => {
      localStorage.setItem('vlo:preferences', JSON.stringify({ theme: t, calm: true }));
    }, theme);
    await newProject(page);
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    expect(await seriousIssues(page)).toEqual([]);
    await switchTo(page, 'Reader');
    expect(await seriousIssues(page)).toEqual([]);
    await switchTo(page, 'Co-writer');
    expect(await seriousIssues(page)).toEqual([]);
    await badge(page).click();
    expect(await seriousIssues(page)).toEqual([]);
  });
}
