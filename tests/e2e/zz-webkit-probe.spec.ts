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

const cases: {
  name: string;
  scene: string | null;
  css?: string;
  still?: boolean;
  wait?: number;
  off?: boolean;
  rounds: number;
}[] = [
  { name: 'no scene', scene: null, rounds: 1 },
  { name: 'scene as it is', scene: 'Rainy window', rounds: 4 },
  { name: 'still scene (reduced motion)', scene: 'Rainy window', still: true, rounds: 2 },
  { name: 'scene picked, then No scene', scene: 'Rainy window', off: true, rounds: 3 },
];

for (const probe of cases) {
  for (let round = 1; round <= probe.rounds; round += 1) {
    test(`probe: ${probe.name}, round ${String(round)}`, async ({ page, browserName }) => {
      test.skip(browserName !== 'webkit', 'The probe is for WebKit only.');
      await start(page, probe.scene);
      if (probe.css) {
        await page.addStyleTag({ content: probe.css });
      }
      if (probe.still) {
        await page.emulateMedia({ reducedMotion: 'reduce' });
        await expect(page.locator('.vlo-scene')).toHaveAttribute('data-moving', 'false');
      }
      if (probe.wait) await page.waitForTimeout(probe.wait);
      if (probe.off) {
        await page.getByRole('button', { name: /^Scene:/ }).click();
        await page
          .getByRole('radiogroup', { name: 'Scene' })
          .getByRole('radio', { name: 'No scene' })
          .click();
        await page.keyboard.press('Escape');
        await expect(page.locator('.vlo-scene')).toHaveCount(0);
      }
      await text(page).focus();
      await page.keyboard.press('ControlOrMeta+End');
      await page.waitForTimeout(500);
      await page.keyboard.type(' It kept on.');
      await page.waitForTimeout(300);
      console.log(
        `[probe] ${probe.name}, round ${String(round)}: ${JSON.stringify(await text(page).innerText())}`,
      );
    });
  }
}
