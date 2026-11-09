import { expect, test, type Page } from '@playwright/test';
import { seriousIssues } from './support/axe';
import { skipOnboarding } from './support/onboarding';
import { editorSelection } from './support/selection';
import { fakeSupabase } from './support/share';

/*
 * Plan Task I4 (roadmap F50, decision R4): a link asks a question, a reader reacts to some words and
 * answers, and the writer turns the reply into a comment from the Feedback tab.
 */

// Playwright routes the fake Supabase requests only with no service worker, as in the reader tests.
test.use({ serviceWorkers: 'block' });

const TEXT = 'The harbour lights came on one by one.';
const scene = (page: Page) => page.getByRole('textbox', { name: 'Scene 1' });

async function novelWithText(page: Page) {
  await skipOnboarding(page);
  await page.getByRole('button', { name: 'New project' }).click();
  await page
    .getByRole('dialog', { name: 'New project' })
    .getByRole('button', { name: 'Create project' })
    .click();
  await expect(scene(page)).toBeFocused();
  await page.keyboard.type(TEXT);
  await expect(page.getByRole('status').filter({ hasText: /Saved/ })).toHaveText('Saved');
}

async function openFeedback(page: Page) {
  await page.keyboard.press('ControlOrMeta+k');
  const menu = page.getByRole('dialog', { name: 'Command menu' });
  await menu.getByRole('combobox').fill('Open Feedback');
  await menu.getByRole('option', { name: 'Open Feedback' }).click();
  await expect(page.getByRole('heading', { level: 2, name: 'Feedback' })).toBeVisible();
}

test('a reader reacts to words and answers, and the writer makes a comment from Feedback', async ({
  browser,
}) => {
  const writerContext = await browser.newContext();
  const fake = await fakeSupabase(writerContext);
  const writer = await writerContext.newPage();
  await novelWithText(writer);
  await writer.getByRole('button', { name: 'Share' }).click();
  const panel = writer.getByRole('dialog', { name: 'Share for reading' });
  await panel.getByLabel('Question 1').fill('Where did you stop reading?');
  // One more empty field shows after each question, up to 5.
  await expect(panel.getByLabel('Question 2')).toHaveValue('');
  await panel.getByRole('button', { name: 'Create link' }).click();
  const link = await panel.getByRole('textbox', { name: 'Link for readers' }).inputValue();
  await panel.getByRole('button', { name: 'Done' }).click();
  await writer.keyboard.press('Escape');

  const readerContext = await browser.newContext();
  await fakeSupabase(readerContext, fake);
  const reader = await readerContext.newPage();
  await reader.goto(new URL(link).pathname + new URL(link).hash);
  const line = reader.getByText(TEXT);
  await expect(line).toBeVisible();
  // The reader selects "lights came".
  await line.evaluate((element, words) => {
    const text = element.firstChild ?? element;
    const start = (text.textContent ?? '').indexOf(words);
    document.getSelection()?.setBaseAndExtent(text, start, text, start + words.length);
  }, 'lights came');
  await reader.getByRole('button', { name: 'Comment on “lights came”' }).click();
  const field = reader.getByLabel('Your comment on “lights came”');
  await expect(field).toBeFocused();
  await reader.getByRole('button', { name: 'Moved me' }).click();
  await expect(reader.getByRole('button', { name: 'Moved me' })).toHaveAttribute('aria-pressed', 'true');
  await field.fill('I could see them.');
  await reader.getByLabel('Your name (optional)').first().fill('Ines');
  expect(await seriousIssues(reader)).toEqual([]);
  await reader.getByRole('button', { name: 'Send comment' }).click();
  const comments = reader.getByRole('list', { name: 'Comments' });
  await expect(comments).toContainText('On “lights came”');
  await expect(comments).toContainText('Moved me');

  await reader.getByLabel('Where did you stop reading?').fill('I read it all.');
  await reader.getByRole('button', { name: 'Send answer' }).click();
  await expect(reader.getByRole('list', { name: 'Answers to question 1' })).toContainText('I read it all.');
  expect(await seriousIssues(reader)).toEqual([]);
  await readerContext.close();

  // The Feedback tab reads the replies when it opens.
  await openFeedback(writer);
  const byScene = writer.getByRole('region', { name: 'Scene 1' });
  await expect(byScene).toContainText('On “lights came”');
  await expect(byScene).toContainText('Moved me');
  await expect(byScene).toContainText('I could see them.');
  await expect(byScene).toContainText('Ines');
  const answers = writer.getByRole('region', { name: 'Answers to your questions' });
  await expect(answers).toContainText('Answer to “Where did you stop reading?”');
  await expect(answers).toContainText('I read it all.');
  // A filter by reaction leaves out the answer, which has none.
  await writer.getByRole('button', { name: 'Moved me' }).click();
  await expect(answers).toHaveCount(0);
  expect(await seriousIssues(writer)).toEqual([]);

  await byScene.getByRole('button', { name: 'Make a comment' }).click();
  await expect(byScene).toContainText('The reply is a comment on its words now.');
  await byScene.getByRole('button', { name: 'Show in text' }).click();
  await expect(scene(writer)).toBeFocused();
  await expect.poll(async () => (await editorSelection(scene(writer))).text).toBe('lights came');

  await writer.reload();
  const list = writer.getByRole('region', { name: 'Comments' });
  await expect(list).toContainText('“lights came”, Ines');
  await expect(list).toContainText('Moved me');
  await expect(list).toContainText('I could see them.');
  await writerContext.close();
});

for (const theme of ['ink', 'paper', 'sepia', 'contrast'] as const) {
  test(`the Feedback tab has no serious axe issues in ${theme}`, async ({ page }) => {
    await page.addInitScript((t) => {
      localStorage.setItem('vlo:preferences', JSON.stringify({ theme: t, calm: false }));
    }, theme);
    await novelWithText(page);
    const projectId = new URL(page.url()).pathname.split('/')[2] ?? '';
    // A stopped link with two replies, so the tab sends no request.
    await page.evaluate(async (id) => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const open = indexedDB.open('vlo');
        open.onsuccess = () => {
          resolve(open.result);
        };
        open.onerror = () => {
          reject(open.error ?? new Error('open failed'));
        };
      });
      const items = await new Promise<{ id: string; kind: string }[]>((resolve) => {
        const request = db.transaction('items').objectStore('items').getAll();
        request.onsuccess = () => {
          resolve(request.result as { id: string; kind: string }[]);
        };
      });
      const sceneId = items.find((i) => i.kind === 'scene')?.id ?? '';
      await new Promise<void>((resolve) => {
        const tx = db.transaction('shares', 'readwrite');
        tx.objectStore('shares').put({
          id: 'link-1',
          projectId: id,
          itemIds: [sceneId],
          title: 'Scene 1',
          createdAt: 1,
          expiresAt: 2,
          ownerToken: '',
          key: '',
          revoked: true,
          questions: ['Where did you stop reading?'],
          comments: [
            {
              id: 'a',
              section: 0,
              block: 0,
              quote: 'lights came',
              start: 12,
              end: 23,
              reaction: 'funny',
              text: 'Ha.',
              at: 3,
            },
            {
              id: 'b',
              section: 0,
              block: 0,
              quote: '',
              question: 0,
              name: 'Ines',
              text: 'At the end.',
              at: 4,
            },
          ],
          commentsReadAt: 5,
        });
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
      });
    }, projectId);
    await page.goto(`/p/${projectId}/feedback`);
    await expect(page.getByRole('region', { name: 'Scene 1' })).toContainText('Funny');
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    expect(await seriousIssues(page)).toEqual([]);
  });
}
