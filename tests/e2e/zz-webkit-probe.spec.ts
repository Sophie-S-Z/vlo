import { expect, test, type Page } from '@playwright/test';
import { skipOnboarding } from './support/onboarding';

/*
 * A short-lived probe for the CI log. It finds which step makes WebKit replace the first sentence when
 * the writer types after a click. It logs and does not fail. It goes away once the cause is fixed.
 */

const text = (page: Page) => page.getByRole('textbox', { name: 'Scene 1' });

async function start(page: Page, scene: string | null) {
  await skipOnboarding(page);
  await page.getByRole('button', { name: 'New project' }).click();
  await page
    .getByRole('dialog', { name: 'New project' })
    .getByRole('button', { name: 'Create project' })
    .click();
  await expect(text(page)).toBeFocused();
  await page.keyboard.type('The rain began.');
  await expect(text(page)).toContainText('The rain began.');
  if (scene) {
    await page.getByRole('button', { name: /^Scene:/ }).click();
    await page.getByRole('radiogroup', { name: 'Scene' }).getByRole('radio', { name: scene }).click();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('radiogroup', { name: 'Scene' })).toBeHidden();
    await expect(page.locator('.vlo-scene')).toHaveAttribute('data-moving', 'true', { timeout: 5_000 });
  } else {
    await text(page).evaluate((element) => {
      element.blur();
    });
  }
}

const cases: { name: string; scene: string | null; click: boolean; end: boolean }[] = [
  { name: 'no scene, click, Ctrl+End', scene: null, click: true, end: true },
  { name: 'scene, click, no Ctrl+End', scene: 'Rainy window', click: true, end: false },
  { name: 'scene, focus, Ctrl+End', scene: 'Rainy window', click: false, end: true },
  { name: 'scene, click, Ctrl+End', scene: 'Rainy window', click: true, end: true },
];

for (const probe of cases) {
  test(`probe: ${probe.name}`, async ({ page, browserName }) => {
    test.skip(browserName !== 'webkit', 'The probe is for WebKit only.');
    await start(page, probe.scene);
    if (probe.click) await text(page).click();
    else await text(page).focus();
    if (probe.end) await page.keyboard.press('ControlOrMeta+End');
    await page.waitForTimeout(500);
    await page.keyboard.type(' It kept on.');
    await page.waitForTimeout(300);
    console.log(`[probe] ${probe.name}: ${JSON.stringify(await text(page).innerText())}`);
  });
}
