import { expect, test } from '@playwright/test';
import { skipOnboarding, writeWithoutAccount } from './support/onboarding';

// A signed-out visit opens on the sign-in screen; these tests write with no account.
test.beforeEach(async ({ page }) => {
  await writeWithoutAccount(page);
});

/*
 * Count rule 2 (Ellipsus comparison, October 2026). A hyphenated word, a slash pair, a web address and a
 * time count as one word, as in Word and Scrivener. The title count and the stats line agree.
 */

test('a hyphenated word, an address and a time count as one word each', async ({ page }) => {
  await skipOnboarding(page);
  await page.getByRole('button', { name: 'New project' }).click();
  await page
    .getByRole('dialog', { name: 'New project' })
    .getByRole('button', { name: 'Create project' })
    .click();
  await expect(page.getByRole('textbox', { name: 'Scene 1' })).toBeFocused();
  await page.keyboard.type('A well-known lab at 10:30 and/or noon. See https://vlo.app/a-b now.');
  // A, well-known, lab, at, 10:30, and/or, noon, See, the address, now.
  await expect(page.getByText('10 words', { exact: true })).toBeVisible();
  await expect(page.getByText(/^10 words · /)).toBeVisible();
});
