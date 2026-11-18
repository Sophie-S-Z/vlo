import { expect, test } from '@playwright/test';
import { seriousIssues } from './support/axe';
import { skipOnboarding, writeWithoutAccount } from './support/onboarding';
import { useTool } from './support/tools';

// A signed-out visit opens on the sign-in screen; these tests write with no account.
test.beforeEach(async ({ page }) => {
  await writeWithoutAccount(page);
});

/* Phase 19, Task D5: sentence focus and the parts-of-speech colors. */

test('sentence focus follows the caret, and the parts of speech get colors and a legend', async ({
  page,
}) => {
  await skipOnboarding(page);
  await page.getByRole('button', { name: 'New project' }).click();
  await page
    .getByRole('dialog', { name: 'New project' })
    .getByRole('button', { name: 'Create project' })
    .click();
  const scene = page.getByRole('textbox', { name: 'Scene 1' });
  await expect(scene).toBeFocused();
  await page.keyboard.type('The tide came in. The old boats lay down.');

  // The command menu has the same switch as the Focus menu, on phones too.
  await page.keyboard.press('ControlOrMeta+k');
  const menu = page.getByRole('dialog', { name: 'Command menu' });
  await menu.getByRole('combobox').fill('Dim other sentences');
  await menu.getByRole('option', { name: 'Dim other sentences' }).click();
  await scene.focus();
  const clear = () =>
    scene.evaluate((root) =>
      [...root.querySelectorAll('p')]
        .flatMap((p) => [...p.childNodes])
        .filter((n) => !(n instanceof HTMLElement && n.classList.contains('vlo-dim')))
        .map((n) => n.textContent)
        .join(''),
    );
  await expect.poll(clear).toBe('The old boats lay down.');
  await page.keyboard.press('Home');
  await expect.poll(clear).toBe('The tide came in. ');

  await useTool(page, 'Show parts of speech');
  const legend = page.getByRole('region', { name: 'Parts of speech' });
  await expect(legend.getByRole('button', { name: 'Nouns' })).toHaveAttribute('aria-pressed', 'true');
  await expect(scene.locator('.vlo-pos-noun')).toHaveText(['tide', 'boats'], { timeout: 30_000 });
  await expect(scene.locator('.vlo-pos-adjective')).toHaveText(['old']);
  expect(await seriousIssues(page)).toEqual([]);
  await legend.getByRole('button', { name: 'Nouns' }).click();
  await expect(scene.locator('.vlo-pos-noun')).toHaveCount(0);
  await legend.getByRole('button', { name: 'Hide parts of speech' }).click();
  await expect(legend).toBeHidden();
  await expect(scene.locator('.vlo-pos-adjective')).toHaveCount(0);
});
