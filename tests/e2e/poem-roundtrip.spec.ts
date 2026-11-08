import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { skipOnboarding } from './support/onboarding';
import { readStoredPoem } from './support/seed-bundle';

/* Gate 1: a pasted poem keeps every character, stanza and hanging indent through save and reload. */

test.use({ bypassCSP: true });

const fixture = readFileSync('tests/fixtures/poem.txt', 'utf8');
const expected = fixture
  .replace(/\n+$/, '')
  .split('\n\n')
  .map((stanza) => stanza.split('\n').map((text) => ({ text, hanging: 0 })));
const lastStanza = expected.at(-1) ?? [];
const lastLine = lastStanza.at(-1);
if (lastLine) lastLine.hanging = 4;

const editor = (page: Page) => page.getByRole('textbox', { name: 'Poem 1' });

/** The id of the item with this title, read from Vlo's own database. */
function itemIdByTitle(page: Page, title: string): Promise<string> {
  return page.evaluate(
    (wanted) =>
      new Promise<string>((resolve, reject) => {
        const open = indexedDB.open('vlo');
        open.onerror = () => {
          reject(open.error ?? new Error('open failed'));
        };
        open.onsuccess = () => {
          const request = open.result.transaction('items').objectStore('items').getAll();
          request.onsuccess = () => {
            open.result.close();
            const rows = request.result as { id: string; title: string }[];
            const found = rows.find((row) => row.title === wanted);
            if (found) resolve(found.id);
            else reject(new Error(`No item called ${wanted}`));
          };
        };
      }),
    title,
  );
}

test('Gate 1: the poem fixture survives paste, a hanging indent, save and reload, character for character', async ({
  page,
}) => {
  await skipOnboarding(page);
  await page.getByRole('button', { name: 'New project' }).click();
  const dialog = page.getByRole('dialog', { name: 'New project' });
  await dialog.getByRole('checkbox', { name: /Poetry collection/ }).click();
  await dialog.getByRole('button', { name: 'Create project' }).click();
  await expect(editor(page)).toBeFocused();

  await editor(page).evaluate((element, text) => {
    const data = new DataTransfer();
    data.setData('text/plain', text);
    const paste = new ClipboardEvent('paste', { bubbles: true, cancelable: true });
    // Firefox ignores `clipboardData` in the event options, so the data goes on the event itself.
    Object.defineProperty(paste, 'clipboardData', { value: data });
    element.dispatchEvent(paste);
  }, fixture);
  await expect(editor(page).locator('[data-poem-line]')).toHaveCount(expected.flat().length);

  await page.keyboard.press('ControlOrMeta+End');
  const more = page.getByRole('button', { name: 'More hanging indent' });
  for (let i = 0; i < 4; i += 1) await more.click();
  await expect(editor(page).locator('[data-poem-line]').last()).toHaveAttribute('data-hanging', '4');
  await expect(page.getByRole('status').filter({ hasText: /Saved|could not save/ })).toHaveText('Saved');

  await page.reload();
  await expect(editor(page)).toBeVisible();
  const shown = await editor(page).locator('[data-poem-line]').allTextContents();
  expect(shown).toEqual(expected.flat().map((line) => line.text));

  const stored = await readStoredPoem(page, await itemIdByTitle(page, 'Poem 1'));
  expect(stored).toEqual(expected);
});
