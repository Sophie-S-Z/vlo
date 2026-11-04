import { expect, test, type Page } from '@playwright/test';
import { skipOnboarding } from './support/onboarding';

/*
 * A short-lived probe for the CI log. It finds which step makes WebKit replace the first sentence when
 * the writer types after using a panel. It logs and does not fail. It goes away once the cause is fixed.
 */

const text = (page: Page) => page.getByRole('textbox', { name: 'Scene 1' });
const scenePicker = (page: Page) => page.getByRole('button', { name: /^Scene:/ });
const sceneRadio = (page: Page, name: string) =>
  page.getByRole('radiogroup', { name: 'Scene' }).getByRole('radio', { name });

async function start(page: Page) {
  await skipOnboarding(page);
  await page.getByRole('button', { name: 'New project' }).click();
  await page
    .getByRole('dialog', { name: 'New project' })
    .getByRole('button', { name: 'Create project' })
    .click();
  await expect(text(page)).toBeFocused();
  await page.keyboard.type('The rain began.');
  await expect(text(page)).toContainText('The rain began.');
}

const cases: { name: string; rounds: number; step: (page: Page) => Promise<void> }[] = [
  {
    name: 'scene panel opened, Escape, no pick',
    rounds: 3,
    step: async (page) => {
      await scenePicker(page).click();
      await expect(sceneRadio(page, 'Rainy window')).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(page.getByRole('radiogroup', { name: 'Scene' })).toBeHidden();
    },
  },
  {
    name: 'page panel opened, Escape',
    rounds: 3,
    step: async (page) => {
      await page.getByRole('button', { name: /^Page:/ }).click();
      await expect(page.getByRole('dialog', { name: 'Page' })).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(page.getByRole('dialog', { name: 'Page' })).toBeHidden();
    },
  },
  {
    name: 'scene picked, panel closed by a click on the page',
    rounds: 3,
    step: async (page) => {
      await scenePicker(page).click();
      await sceneRadio(page, 'Rainy window').click();
      await page.mouse.click(5, 5);
      await expect(page.getByRole('radiogroup', { name: 'Scene' })).toBeHidden();
    },
  },
  {
    name: 'scene picked, Escape, then a reload',
    rounds: 2,
    step: async (page) => {
      await scenePicker(page).click();
      await sceneRadio(page, 'Rainy window').click();
      await page.keyboard.press('Escape');
      await expect(page.getByRole('radiogroup', { name: 'Scene' })).toBeHidden();
      await page.reload();
      await expect(text(page)).toContainText('The rain began.');
    },
  },
  {
    name: 'Escape and Tab out of the editor',
    rounds: 2,
    step: async (page) => {
      await page.keyboard.press('Escape');
      await page.keyboard.press('Tab');
      await expect(text(page)).not.toBeFocused();
    },
  },
];

for (const probe of cases) {
  for (let round = 1; round <= probe.rounds; round += 1) {
    test(`probe: ${probe.name}, round ${String(round)}`, async ({ page, browserName }) => {
      test.skip(browserName !== 'webkit', 'The probe is for WebKit only.');
      await start(page);
      await probe.step(page);
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
