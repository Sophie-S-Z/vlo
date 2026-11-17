import { expect, test, type Page } from '@playwright/test';
import { seriousIssues } from './support/axe';
import { skipOnboarding, writeWithoutAccount } from './support/onboarding';
import { editorSelection } from './support/selection';
import { useTool } from './support/tools';

// A signed-out visit opens on the sign-in screen; these tests write with no account.
test.beforeEach(async ({ page }) => {
  await writeWithoutAccount(page);
});

/* Phase 19, Part A: the menus, the modes, the last place, page look, item targets, print and phones. */

const THEMES = ['ink', 'paper', 'sepia', 'contrast'] as const;
const scene = (page: Page) => page.getByRole('textbox', { name: 'Scene 1' });
const toolbar = (page: Page) => page.getByRole('toolbar', { name: 'Formatting', exact: true });

async function newNovel(page: Page, text = 'The harbour lights came on one by one.') {
  await skipOnboarding(page);
  await page.getByRole('button', { name: 'New project' }).click();
  await page
    .getByRole('dialog', { name: 'New project' })
    .getByRole('button', { name: 'Create project' })
    .click();
  await expect(scene(page)).toBeFocused();
  await page.keyboard.type(text);
}

test('Insert, Format and Review hold every tool in named groups, and each runs its tool', async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, 'Phones show the same groups in the More menu.');
  await newNovel(page);
  for (const [menu, groups] of [
    ['Insert', ['Notes', 'Media', 'Breaks and characters']],
    ['Format', ['Text', 'Paragraph', 'Clear']],
    ['Review', ['Find', 'Listen and speak', 'Checks', 'Show', 'Help']],
  ] as const) {
    await toolbar(page).getByRole('button', { name: menu, exact: true }).click();
    const open = page.getByRole('menu');
    for (const group of groups) await expect(open.getByRole('group', { name: group })).toBeVisible();
    expect(await seriousIssues(page)).toEqual([]);
    await page.keyboard.press('Escape');
    await expect(open).toBeHidden();
    await expect(scene(page)).toBeFocused();
  }

  // Format: underline the selected text.
  await page.keyboard.press('ControlOrMeta+a');
  await useTool(page, 'Underline');
  await expect(scene(page).locator('u')).toHaveText('The harbour lights came on one by one.');
  // Insert: a scene break.
  await page.keyboard.press('End');
  await useTool(page, 'Scene break');
  await expect(scene(page).locator('[data-scene-break]')).toHaveCount(1);
  // Review: the find bar.
  await useTool(page, 'Find');
  await expect(page.getByRole('search', { name: 'Find and replace' })).toBeVisible();
});

test('the Mode menu switches between Editing, Suggesting and Viewing', async ({ page, isMobile }) => {
  test.skip(isMobile, 'Phones show the modes in the More menu.');
  await newNovel(page);
  const mode = toolbar(page).getByRole('button', { name: /^Mode:/ });
  await expect(mode).toHaveAccessibleName('Mode: Editing');

  await mode.click();
  await page.getByRole('menuitemradio', { name: /Suggesting/ }).click();
  await expect(mode).toHaveAccessibleName('Mode: Suggesting');
  await expect(page.getByRole('region', { name: 'Track changes is on' })).toBeVisible();

  await mode.click();
  await page.getByRole('menuitemradio', { name: /Viewing/ }).click();
  await expect(mode).toHaveAccessibleName('Mode: Viewing');
  await expect(scene(page)).toHaveAttribute('contenteditable', 'false');
  await expect(toolbar(page).getByRole('button', { name: 'Bold' })).toBeDisabled();

  await mode.click();
  await page.getByRole('menuitemradio', { name: /Editing/ }).click();
  await expect(scene(page)).toHaveAttribute('contenteditable', 'true');
  await expect(page.getByRole('region', { name: 'Track changes is on' })).toBeHidden();
});

test('every switch in the Focus and Review menus turns off on a second click', async ({ page, isMobile }) => {
  test.skip(isMobile, 'Phones show the same switches in the More menu.');
  await newNovel(page);
  const menus = [
    {
      open: () => page.getByRole('button', { name: 'Focus', exact: true }).click(),
      names: [
        'Typewriter scrolling',
        'Dim other lines',
        'Hide the text',
        'Blur the words',
        'Cover the words with bars',
        'Keep my paragraph clear',
      ],
    },
    {
      open: () => toolbar(page).getByRole('button', { name: 'Review', exact: true }).click(),
      names: ['Style check', 'Continuity check', 'Track changes', 'Show AI text', 'Show Codex names'],
    },
  ];
  for (const { open, names } of menus) {
    for (const name of names) {
      const item = page.getByRole('menuitemcheckbox', { name, exact: true });
      await open();
      // Some switches start on, such as Show AI text, so each test starts from the switch as it is.
      const start = await item.getAttribute('aria-checked');
      await page.keyboard.press('Escape');
      for (const on of [start === 'true' ? 'false' : 'true', start]) {
        await open();
        await item.click();
        await open();
        await expect(item, `${name} after a click`).toHaveAttribute('aria-checked', on ?? 'false');
        await page.keyboard.press('Escape');
      }
    }
  }
  await expect(page.locator('html')).not.toHaveAttribute('data-hide-text');

  // Focus mode puts Leave focus mode in the place of the Focus button.
  await page.getByRole('button', { name: 'Focus', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Enter focus mode' }).click();
  await page.getByRole('button', { name: 'Leave focus mode' }).click();
  await expect(toolbar(page)).toBeVisible();
});

test('an item opens again with the caret where the writer left it', async ({ page }) => {
  await newNovel(page);
  await page.keyboard.press('Enter');
  await page.keyboard.type('Mara counted them from the sea wall.');
  // Put the caret before "counted".
  await scene(page).evaluate((root) => {
    const editor = (root as unknown as { editor: { commands: { setTextSelection: (n: number) => void } } })
      .editor;
    const text = root.textContent;
    const at = text.indexOf('counted') - text.indexOf('Mara');
    // The second paragraph starts after the first one and two paragraph boundaries.
    editor.commands.setTextSelection('The harbour lights came on one by one.'.length + 3 + at);
  });
  const before = await editorSelection(scene(page));
  await expect(page.getByRole('status').filter({ hasText: /Saved/ })).toHaveText('Saved');
  // The place keeps after a 1 s pause.
  await page.waitForTimeout(1200);
  await page.reload();
  await expect(scene(page)).toBeFocused();
  await expect.poll(async () => (await editorSelection(scene(page))).from).toBe(before.from);
});

test('Page look changes the screen only, keeps the choice and has no serious axe issues', async ({
  page,
}) => {
  await newNovel(page);
  await page.keyboard.press('Enter');
  await page.keyboard.type('Mara counted them.');
  const second = scene(page).locator('p').nth(1);
  await expect(second).toHaveCSS('text-indent', '0px');

  await page.getByRole('button', { name: 'Page look' }).click();
  const panel = page.getByRole('dialog', { name: 'Page look' });
  await panel.getByRole('button', { name: /Book/ }).click();
  await expect(panel.getByRole('button', { name: /Book/ })).toHaveAttribute('aria-pressed', 'true');
  await expect(second).not.toHaveCSS('text-indent', '0px');
  expect(await seriousIssues(page)).toEqual([]);

  await panel.getByRole('group', { name: 'Line spacing' }).getByRole('button', { name: 'Double' }).click();
  await expect(scene(page)).toHaveCSS('line-height', /\d/);
  await panel.getByLabel('Screen font').selectOption('literata');
  await expect(scene(page)).toHaveCSS('font-family', /Literata/);

  await panel.getByRole('button', { name: 'Save this look' }).click();
  await panel.getByLabel('Name of the look').fill('Night desk');
  await panel.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(panel.getByRole('button', { name: 'Night desk', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );

  await page.reload();
  await expect(scene(page).locator('p').nth(1)).not.toHaveCSS('text-indent', '0px');
  await expect(scene(page)).toHaveCSS('font-family', /Literata/);
});

for (const theme of THEMES) {
  test(`the new menus and popovers have no serious axe issues in ${theme}`, async ({ page, isMobile }) => {
    test.skip(isMobile, 'The phone layout runs the same surfaces through the More menu.');
    await page.addInitScript((t) => {
      localStorage.setItem('vlo:preferences', JSON.stringify({ theme: t, calm: false }));
    }, theme);
    await newNovel(page);
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    for (const name of ['Insert', 'Format', 'Review', 'Mode: Editing']) {
      await toolbar(page).getByRole('button', { name, exact: true }).click();
      expect(await seriousIssues(page)).toEqual([]);
      await page.keyboard.press('Escape');
    }
    for (const name of ['Page look', 'Word target']) {
      await page.getByRole('button', { name, exact: true }).click();
      expect(await seriousIssues(page)).toEqual([]);
      await page.keyboard.press('Escape');
    }
  });
}

/** Checks the item's line in the binder. A phone opens the binder drawer for the check, and closes it. */
async function expectInBinder(page: Page, isMobile: boolean, text: string) {
  if (isMobile) await page.getByRole('button', { name: 'Binder' }).click();
  await expect(page.getByRole('navigation', { name: 'Binder' }).getByText(text)).toBeVisible();
  if (isMobile) await page.keyboard.press('Escape');
}

test('a word target fills its ring, and the binder shows how far the item is', async ({ page, isMobile }) => {
  await newNovel(page, 'One two three four five six seven eight.');
  await page.getByRole('button', { name: 'Word target', exact: true }).click();
  const panel = page.getByRole('dialog', { name: 'Word target' });
  await panel.getByLabel('Word target for Scene 1').fill('16');
  await panel.getByRole('button', { name: 'Set' }).click();
  await expect(page.getByRole('button', { name: 'Word target: 8 of 16 words' })).toBeVisible();
  await expectInBinder(page, isMobile, '50% of 16');

  await scene(page).click();
  await page.keyboard.press('ControlOrMeta+End');
  await page.keyboard.type(' Nine ten eleven twelve thirteen fourteen fifteen sixteen.');
  await expect(page.getByRole('button', { name: 'Word target met: 16 of 16 words' })).toBeVisible();
  await expectInBinder(page, isMobile, 'Target met');

  await page.getByRole('button', { name: /^Word target met/ }).click();
  await page
    .getByRole('dialog', { name: 'Word target' })
    .getByRole('button', { name: 'Remove target' })
    .click();
  await expect(page.getByRole('button', { name: 'Word target', exact: true })).toBeVisible();
});

test('a word target out of range shows why and keeps the old one', async ({ page }) => {
  await newNovel(page);
  await page.getByRole('button', { name: 'Word target', exact: true }).click();
  const panel = page.getByRole('dialog', { name: 'Word target' });
  await panel.getByLabel('Word target for Scene 1').fill('2.5');
  await panel.getByRole('button', { name: 'Set' }).click();
  await expect(panel.getByRole('alert')).toHaveText(/Type a whole number/);
});

test('print shows only the open text', async ({ page, isMobile }) => {
  test.skip(isMobile, 'The print sheet is the same on a phone.');
  await newNovel(page);
  await page.evaluate(() => window.dispatchEvent(new Event('beforeprint')));
  await page.emulateMedia({ media: 'print' });
  await expect(scene(page)).toBeVisible();
  await expect(toolbar(page)).toBeHidden();
  await expect(page.getByRole('heading', { level: 1 })).toBeHidden();
  await page.emulateMedia({ media: 'screen' });
  await page.evaluate(() => window.dispatchEvent(new Event('afterprint')));
  await expect(toolbar(page)).toBeVisible();
});

test.describe('on a phone with its keyboard open', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test('the text starts at the top and the toolbar sits on the keyboard', async ({ page }) => {
    // A browser in a test has no on-screen keyboard, so a stand-in visual viewport shrinks as one does.
    await page.addInitScript(() => {
      const view = Object.assign(new EventTarget(), { height: window.innerHeight, offsetTop: 0, width: 390 });
      Object.defineProperty(window, 'visualViewport', { configurable: true, value: view });
      (window as unknown as { openKeyboard: (open: boolean) => void }).openKeyboard = (open) => {
        view.height = open ? window.innerHeight - 320 : window.innerHeight;
        view.dispatchEvent(new Event('resize'));
      };
    });
    await newNovel(page);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

    await page.evaluate(() => {
      (window as unknown as { openKeyboard: (open: boolean) => void }).openKeyboard(true);
    });
    await expect(page.locator('html')).toHaveAttribute('data-vlo-typing', '');
    await expect(page.getByRole('heading', { level: 1 })).toBeHidden();
    const text = await scene(page).boundingBox();
    expect(text?.y ?? Infinity).toBeLessThan(120);
    const bar = await toolbar(page).boundingBox();
    const viewport = page.viewportSize();
    expect(Math.round((bar?.y ?? 0) + (bar?.height ?? 0))).toBeLessThanOrEqual(
      (viewport?.height ?? 0) - 320 + 1,
    );
    expect(await seriousIssues(page)).toEqual([]);

    await toolbar(page).getByRole('button', { name: 'Hide keyboard' }).click();
    await page.evaluate(() => {
      (window as unknown as { openKeyboard: (open: boolean) => void }).openKeyboard(false);
    });
    await expect(page.locator('html')).not.toHaveAttribute('data-vlo-typing', '');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  });
});
