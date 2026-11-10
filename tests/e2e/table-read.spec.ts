import { expect, test, type Page } from '@playwright/test';
import { seriousIssues } from './support/axe';
import { skipOnboarding } from './support/onboarding';

/* Plan Task K3 (roadmap F58): a table read gives each Codex character a voice. dialogue.test.ts holds the rules. */

const scene = (page: Page) => page.getByRole('textbox', { name: 'Scene 1' });
const panel = (page: Page) => page.getByRole('dialog', { name: 'Read aloud' });

/** Two on-device voices that record what they say, and end each sentence at once. */
async function fakeVoices(page: Page) {
  await page.addInitScript(() => {
    const voices = [
      { voiceURI: 'v-moira', name: 'Moira', lang: 'en-IE', localService: true, default: true },
      { voiceURI: 'v-ava', name: 'Ava', lang: 'en-US', localService: true, default: false },
    ];
    const said: string[] = [];
    Object.assign(window, { said });
    class Utterance {
      voice: { voiceURI: string } | null = null;
      rate = 1;
      lang = '';
      onend: (() => void) | null = null;
      onerror: (() => void) | null = null;
      constructor(public text: string) {}
    }
    Object.defineProperty(window, 'SpeechSynthesisUtterance', { value: Utterance });
    Object.defineProperty(window, 'speechSynthesis', {
      value: {
        getVoices: () => voices,
        speak: (u: Utterance) => {
          said.push(`${u.voice?.voiceURI ?? ''}: ${u.text}`);
          setTimeout(() => u.onend?.(), 10);
        },
        cancel: () => undefined,
        pause: () => undefined,
        resume: () => undefined,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
      },
    });
  });
}

test('F58: a table read reads each quote in its character’s voice, and keeps the choice', async ({
  page,
}) => {
  await fakeVoices(page);
  await skipOnboarding(page);
  await page.getByRole('button', { name: 'New project' }).click();
  await page
    .getByRole('dialog', { name: 'New project' })
    .getByRole('button', { name: 'Create project' })
    .click();
  await expect(scene(page)).toBeFocused();
  await page.keyboard.type('“Row,” said Mira. The oar broke.');

  await page.getByRole('navigation', { name: 'Project views' }).getByRole('link', { name: 'Codex' }).click();
  await page.getByRole('textbox', { name: 'Name' }).fill('Mira');
  await page.getByRole('button', { name: 'Add entry' }).click();
  await expect(page.getByRole('heading', { level: 3, name: 'Mira' })).toBeVisible();
  await page.getByRole('navigation', { name: 'Project views' }).getByRole('link', { name: 'Write' }).click();

  // The cursor goes to the start of the text, before the quote.
  await scene(page)
    .locator('p')
    .first()
    .click({ position: { x: 1, y: 5 } });
  await page.getByRole('button', { name: 'More tools' }).click();
  await page.getByRole('menuitem', { name: 'Read aloud' }).click();
  await panel(page).getByRole('checkbox', { name: 'Table read: a voice for each character' }).check();
  await expect(panel(page).getByLabel('Voice of the narrator')).toHaveValue('v-moira');
  await expect(panel(page).getByLabel('Voice of Mira')).toHaveValue('v-ava');
  expect(await seriousIssues(page)).toEqual([]);

  await panel(page).getByRole('button', { name: 'Read from the cursor' }).click();
  await expect
    .poll(() => page.evaluate(() => (window as unknown as { said: string[] }).said))
    .toEqual(['v-ava: “Row,”', 'v-moira: said Mira.', 'v-moira: The oar broke.']);

  await page.reload();
  await scene(page).click();
  await page.getByRole('button', { name: 'More tools' }).click();
  await page.getByRole('menuitem', { name: 'Read aloud' }).click();
  await expect(panel(page).getByRole('checkbox', { name: /Table read/ })).toBeChecked();
});
