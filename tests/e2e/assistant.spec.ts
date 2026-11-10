import { readFile } from 'node:fs/promises';
import { expect, test, type Page, type Route } from '@playwright/test';
import { seriousIssues } from './support/axe';
import { skipOnboarding } from './support/onboarding';

/*
 * Plan Tasks D5 and D6 (spec section 10, F23 to F26, US10, US11). The Assistant panel against fake
 * providers on their real addresses: the "What will be sent" drawer, Reader answers that never reach the
 * text, Co-writer Insert with the AI mark and one Undo, the key terms, the limit and blocked messages, and
 * the AI provenance page. Real providers are checked by hand (plan decision P4).
 */

const mod = process.platform === 'darwin' ? 'Meta' : 'Control';
const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, POST, OPTIONS',
  'access-control-allow-headers':
    'content-type, authorization, x-api-key, anthropic-version, anthropic-dangerous-direct-browser-access',
};

const text = (page: Page) => page.getByRole('main').getByRole('textbox').first();
/** The text by its class: a phone's Assistant sheet hides the page from the accessibility tree. */
const words = (page: Page) => page.locator('main .vlo-manuscript').first();
const badge = (page: Page) => page.getByRole('button', { name: /^AI mode: / });
const panel = (page: Page) => page.getByTestId('assistant');
const drawer = (page: Page) => page.getByTestId('send-drawer');

async function newProject(page: Page) {
  await skipOnboarding(page);
  await page.getByRole('button', { name: 'New project' }).click();
  const create = page.getByRole('dialog', { name: 'New project' });
  await create.getByRole('checkbox', { name: /Novel/ }).click();
  await create.getByRole('button', { name: 'Create project' }).click();
  await expect(text(page)).toBeFocused();
}

async function saved(page: Page) {
  await expect(page.getByRole('status').filter({ hasText: /Saved/ })).toHaveText('Saved');
}

async function switchTo(page: Page, label: 'Reader' | 'Co-writer' | 'Pen') {
  await badge(page).click();
  const dialog = page.getByRole('dialog', { name: 'AI mode' });
  await dialog.getByRole('radio', { name: new RegExp(`^${label}`) }).click();
  await dialog.getByRole('button', { name: `Switch to ${label} mode` }).click();
  await expect(badge(page)).toHaveAccessibleName(`AI mode: ${label}`);
}

/** Shows the panel: it opens by itself on a large screen, and is a sheet behind a button on a phone. */
async function openAssistant(page: Page) {
  const toggle = page.getByRole('button', { name: /^(Assistant|Hide the Assistant)$/ });
  await expect(toggle).toBeVisible();
  if ((await toggle.getAttribute('aria-expanded')) !== 'true') await toggle.click();
  await expect(panel(page)).toBeVisible();
}

/** Closes the phone's Assistant sheet, which covers the page. A large screen has no sheet. */
async function closeSheet(page: Page) {
  const sheet = page.getByRole('dialog', { name: 'Assistant' });
  if (await sheet.isVisible()) {
    await sheet.getByRole('button', { name: 'Close the Assistant' }).click();
    await expect(sheet).toHaveCount(0);
  }
}

/** Picks a server on this computer, which needs no key. */
async function useOllama(page: Page, model = 'llama3.2') {
  await panel(page).getByRole('button', { name: 'Change engine' }).click();
  await panel(page).getByLabel('Where the AI runs').selectOption('ollama');
  await panel(page).getByLabel('Model', { exact: true }).fill(model);
  await panel(page).getByRole('button', { name: 'Use this engine' }).click();
  await expect(panel(page)).toContainText(`Engine: Ollama, ${model}`);
}

interface Sent {
  model: string;
  max_tokens: number;
  messages: { role: string; content: string }[];
}

/** A fake OpenAI-compatible server that streams `pieces`, and keeps each request body. */
async function fakeChat(page: Page, url: string, answer: string[] | { status: number; body: string }) {
  const sent: Sent[] = [];
  await page.route(url, async (route: Route) => {
    const request = route.request();
    if (request.method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers: CORS });
      return;
    }
    sent.push(request.postDataJSON() as Sent);
    if (!Array.isArray(answer)) {
      await route.fulfill({ status: answer.status, headers: CORS, body: answer.body });
      return;
    }
    const body =
      answer.map((t) => `data: ${JSON.stringify({ choices: [{ delta: { content: t } }] })}\n\n`).join('') +
      'data: [DONE]\n\n';
    await route.fulfill({
      status: 200,
      headers: { ...CORS, 'content-type': 'text/event-stream' },
      body,
    });
  });
  return sent;
}

test('US10: a Reader answer shows the exact request first, and has no way into the text', async ({
  page,
}) => {
  await newProject(page);
  await page.keyboard.type('Mira wants the ledger. She hides it under the boards.');
  await saved(page);
  await switchTo(page, 'Reader');
  await openAssistant(page);
  await useOllama(page);
  const sent = await fakeChat(page, 'http://localhost:11434/v1/chat/completions', [
    'The ledger ',
    'carries the scene.',
  ]);

  await expect(panel(page).getByLabel('What to ask')).toHaveValue('feedback');
  // Reader mode offers no drafting action.
  await expect(panel(page).getByRole('option', { name: 'Continue' })).toHaveCount(0);
  await panel(page).getByRole('button', { name: 'Prepare the request' }).click();
  await expect(drawer(page)).toContainText('What will be sent');
  await expect(drawer(page)).toContainText('To localhost:11434, about');
  const exact = drawer(page).getByLabel('The exact text');
  await expect(exact).toContainText('Mira wants the ledger. She hides it under the boards.');
  await expect(exact).toBeFocused();
  expect(sent).toHaveLength(0);
  expect(await seriousIssues(page)).toEqual([]);

  const shown = await exact.textContent();
  await drawer(page).getByRole('button', { name: 'Send' }).click();
  const answer = panel(page).getByRole('listitem').filter({ hasText: 'Feedback on Scene 1' });
  await expect(answer).toContainText('The ledger carries the scene.');
  await expect(answer).toContainText('Done.');

  // The drawer showed the body as it went: the instructions, then the writer's message.
  expect(sent).toHaveLength(1);
  const body = sent[0];
  expect(shown).toBe(
    `Instructions:\n${body?.messages[0]?.content ?? ''}\n\nYou:\n${body?.messages[1]?.content ?? ''}`,
  );

  await expect(answer.getByRole('button', { name: /Insert/ })).toHaveCount(0);
  await expect(answer.locator('[draggable="true"]')).toHaveCount(0);
  await expect(answer.locator('.vlo-answer')).toHaveAttribute('draggable', 'false');
  await expect(words(page)).not.toContainText('carries the scene');
  await expect(words(page).locator('.vlo-ai')).toHaveCount(0);
  expect(await seriousIssues(page)).toEqual([]);
});

test('F61: the reader panel sends the Codex notes of the names in the text, and gives four cards with no Insert', async ({
  page,
}) => {
  await newProject(page);
  await page.keyboard.type('Mira hides the ledger.');
  await saved(page);
  const views = page.getByRole('navigation', { name: 'Project views' });
  await views.getByRole('link', { name: 'Codex' }).click();
  await page.getByRole('textbox', { name: 'Name' }).fill('Mira');
  await page.getByRole('button', { name: 'Add entry' }).click();
  await page.getByRole('textbox', { name: 'Note' }).fill('Owes the harbour master.');
  await page.getByRole('heading', { level: 2, name: 'Codex' }).click();
  await views.getByRole('link', { name: 'Write' }).click();

  // Co-writer mode has Insert for drafts, and still none for the readers' notes.
  await switchTo(page, 'Co-writer');
  await openAssistant(page);
  await useOllama(page);
  const sent = await fakeChat(page, 'http://localhost:11434/v1/chat/completions', [
    '## First-time reader\nThe ledger hooks me.\n## Genre fan\nWhere is the storm?\n',
    '## Developmental editor\nRaise the stakes.\n## Line editor\nTwo verbs repeat.',
  ]);
  await panel(page).getByLabel('What to ask').selectOption('panel');
  await panel(page).getByRole('button', { name: 'Prepare the request' }).click();
  const exact = drawer(page).getByLabel('The exact text');
  await expect(exact).toContainText('Mira hides the ledger.');
  await expect(exact).toContainText('- Mira (character): Owes the harbour master.');
  await drawer(page).getByRole('button', { name: 'Send' }).click();

  const answer = panel(page).getByRole('listitem').filter({ hasText: 'Reader panel on Scene 1' });
  await expect(answer).toContainText('Done.');
  const readers = answer.getByRole('list', { name: 'Readers' }).getByRole('listitem');
  await expect(readers.getByRole('heading')).toHaveText([
    'First-time reader',
    'Genre fan',
    'Developmental editor',
    'Line editor',
  ]);
  await expect(readers.nth(3)).toContainText('Two verbs repeat.');
  await expect(answer.getByRole('button', { name: /Insert/ })).toHaveCount(0);
  expect(sent[0]?.messages[1]?.content).toContain('Owes the harbour master.');
  expect(await seriousIssues(page)).toEqual([]);
});

test('a Co-writer draft goes in with the AI mark, one Undo takes it out, and the export can list it', async ({
  page,
}) => {
  await newProject(page);
  await page.keyboard.type('The rain stopped.');
  await saved(page);
  await switchTo(page, 'Co-writer');
  await openAssistant(page);
  await useOllama(page);
  const sent = await fakeChat(page, 'http://localhost:11434/v1/chat/completions', [
    'The kettle ',
    'sang in the dark kitchen.',
  ]);

  await panel(page).getByLabel('What to ask').selectOption('continue');
  await panel(page).getByLabel('Length').selectOption('50');
  await panel(page).getByRole('button', { name: 'Prepare the request' }).click();
  await expect(drawer(page).getByLabel('The exact text')).toContainText('The rain stopped.');
  await drawer(page).getByRole('button', { name: 'Send' }).click();
  const answer = panel(page).getByRole('listitem').filter({ hasText: 'Continue Scene 1' });
  await expect(answer).toContainText('The kettle sang in the dark kitchen.');
  expect(sent[0]?.max_tokens).toBe(160);
  // The text stays the writer's until Insert.
  await expect(words(page)).toHaveText('The rain stopped.');

  await answer.getByRole('button', { name: 'Insert' }).click();
  await expect(text(page)).toHaveText('The rain stopped. The kettle sang in the dark kitchen.');
  const mark = text(page).locator('.vlo-ai');
  await expect(mark).toHaveText(' The kettle sang in the dark kitchen.');
  await expect(mark).toHaveAttribute('data-ai-provider', 'Ollama');
  await expect(mark).toHaveAttribute('data-ai-model', 'llama3.2');
  await expect(text(page)).toHaveAttribute('data-show-ai', '');
  await saved(page);

  // One Undo takes out the whole draft, and Redo brings it back with its mark.
  await text(page).focus();
  await page.keyboard.press(`${mod}+z`);
  await expect(text(page)).toHaveText('The rain stopped.');
  await page.keyboard.press(`${mod}+Shift+z`);
  await expect(mark).toHaveText(' The kettle sang in the dark kitchen.');

  // Words the writer types at the end are the writer's own.
  await page.keyboard.press('End');
  await page.keyboard.type(' Mine.');
  await expect(mark).toHaveText(' The kettle sang in the dark kitchen.');
  await saved(page);

  // "Show AI text" hides the tint, and the mark stays in the text.
  await page.getByRole('button', { name: 'More tools' }).click();
  await page.getByRole('menuitemcheckbox', { name: 'Show AI text' }).click();
  await expect(text(page)).not.toHaveAttribute('data-show-ai', '');
  await expect(mark).toHaveCount(1);

  await page.getByRole('button', { name: 'Export', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Export' });
  await dialog.getByRole('radio', { name: /Markdown/ }).click();
  await expect(dialog.getByRole('switch', { name: 'Add an AI provenance page' })).toBeChecked();
  expect(await seriousIssues(page)).toEqual([]);
  const download = page.waitForEvent('download');
  await dialog.getByRole('button', { name: 'Export', exact: true }).click();
  const file = await readFile(await (await download).path(), 'utf8');
  expect(file).toContain('The rain stopped. The kettle sang in the dark kitchen. Mine.');
  expect(file).toContain('AI provenance');
  expect(file).toContain('of the text in this export carries the Vlo AI mark: 37 of 60 characters.');
  expect(file).toContain('Ollama, llama3.2');
});

test('each version of a rewrite replaces the words that the last Insert put in, after the text moves', async ({
  page,
}) => {
  await newProject(page);
  await page.keyboard.type('The old dog slept.');
  await saved(page);
  // Select "old dog".
  await page.keyboard.press('Home');
  for (let i = 0; i < 4; i += 1) await page.keyboard.press('ArrowRight');
  for (let i = 0; i < 7; i += 1) await page.keyboard.press('Shift+ArrowRight');
  await switchTo(page, 'Co-writer');
  await openAssistant(page);
  await useOllama(page);
  const sent = await fakeChat(page, 'http://localhost:11434/v1/chat/completions', [
    'grey hound\n---\n',
    'tired cat\n---\nfox',
  ]);

  await panel(page).getByLabel('What to ask').selectOption('alternatives');
  await panel(page).getByRole('button', { name: 'Prepare the request' }).click();
  await expect(drawer(page).getByLabel('The exact text')).toContainText('<passage>\nold dog\n</passage>');
  await drawer(page).getByRole('button', { name: 'Send' }).click();
  const answer = panel(page).getByRole('listitem').filter({ hasText: 'Three alternatives in Scene 1' });
  await expect(answer).toContainText('Done.');
  expect(sent).toHaveLength(1);

  const sheet = page.getByRole('dialog', { name: 'Assistant' });
  const insertVersion = async (n: number) => {
    if (!(await panel(page).isVisible())) await openAssistant(page);
    const phone = await sheet.isVisible();
    await answer.getByRole('button', { name: `Insert version ${String(n)}` }).click();
    // On a phone the sheet closes after an Insert, so the writer sees the text.
    if (phone) await expect(sheet).toHaveCount(0);
  };
  await insertVersion(1);
  await expect(words(page)).toHaveText('The grey hound slept.');
  await insertVersion(2);
  await expect(words(page)).toHaveText('The tired cat slept.');
  await expect(words(page).locator('.vlo-ai')).toHaveText('tired cat');

  // New words before it move the draft. Vlo finds its words again.
  await closeSheet(page);
  // A click at the left edge of the line puts the cursor at the start. A phone has no Home key.
  const line = await words(page).locator('p').first().boundingBox();
  if (!line) throw new Error('The paragraph has no box.');
  await page.mouse.click(line.x + 1, line.y + line.height / 2);
  await expect(text(page)).toBeFocused();
  await page.keyboard.type('Now ');
  await expect(words(page)).toHaveText('Now The tired cat slept.');
  await saved(page);
  await insertVersion(3);
  await expect(words(page)).toHaveText('Now The fox slept.');
  await expect(words(page).locator('.vlo-ai')).toHaveText('fox');
});

test('US11: a free-tier key works only after the writer agrees to the data terms', async ({ page }) => {
  await newProject(page);
  await switchTo(page, 'Reader');
  await openAssistant(page);
  await panel(page).getByRole('button', { name: 'Change engine' }).click();
  await panel(page).getByLabel('Where the AI runs').selectOption('gemini');
  await expect(panel(page).getByLabel('Model', { exact: true })).toHaveValue('gemini-2.5-flash');
  await panel(page).getByRole('button', { name: 'Add a key' }).click();

  const dialog = page.getByRole('dialog', { name: 'Key for Google Gemini' });
  await expect(dialog).toContainText('Human reviewers at Google can read what you send.');
  await expect(dialog).toContainText('Google can use what you send');
  await dialog.getByLabel('Key', { exact: true }).fill('AIza-test-key');
  await dialog.getByRole('button', { name: 'Use this key' }).click();
  await expect(dialog.getByRole('alert')).toHaveText(
    'Tick the box to say that you read the terms of Google Gemini.',
  );
  expect(await seriousIssues(page)).toEqual([]);
  await dialog
    .getByRole('checkbox', { name: 'I read these terms, and I agree to them for my text.' })
    .check();
  await dialog.getByRole('button', { name: 'Use this key' }).click();
  await expect(dialog).toHaveCount(0);
  await expect(panel(page)).toContainText('Key: ready for this tab.');

  // The terms stay agreed on this device, and the key stays in this tab only.
  await panel(page).getByRole('button', { name: 'Change the key' }).click();
  await expect(dialog).not.toContainText('Human reviewers');
  await dialog.getByRole('button', { name: 'Cancel' }).click();
});

test('a limit answer shows once with no second request, and a blocked provider says so', async ({ page }) => {
  await newProject(page);
  await page.keyboard.type('One line of text.');
  await saved(page);
  await switchTo(page, 'Reader');
  await openAssistant(page);
  await panel(page).getByRole('button', { name: 'Change engine' }).click();
  await panel(page).getByLabel('Where the AI runs').selectOption('groq');
  await panel(page).getByRole('button', { name: 'Use this engine' }).click();
  const sent = await fakeChat(page, 'https://api.groq.com/openai/v1/chat/completions', {
    status: 429,
    body: JSON.stringify({ error: { message: 'Rate limit reached for requests per day' } }),
  });

  // With no key in this tab, Prepare asks for one first.
  await panel(page).getByRole('button', { name: 'Prepare the request' }).click();
  const key = page.getByRole('dialog', { name: 'Key for Groq' });
  await key.getByRole('checkbox', { name: /I read these terms/ }).check();
  await key.getByLabel('Key', { exact: true }).fill('gsk_test');
  await key.getByRole('button', { name: 'Use this key' }).click();
  await expect(drawer(page)).toContainText('To api.groq.com');
  await drawer(page).getByLabel('Do not show this again').check();
  await drawer(page).getByRole('button', { name: 'Send' }).click();
  const answer = panel(page).getByRole('listitem').first();
  await expect(answer).toContainText('Groq says you reached its limit.');
  await expect(answer).toContainText('Rate limit reached for requests per day');
  await expect(answer).toContainText('Stopped with an error.');
  await expect(panel(page).getByText('Groq says you reached its limit.', { exact: false })).toHaveCount(1);
  expect(sent).toHaveLength(1);

  // The drawer is off now, so the next request goes at once. A refused connection reads as blocked.
  await page.unroute('https://api.groq.com/openai/v1/chat/completions');
  await page.route('https://api.groq.com/openai/v1/chat/completions', (route) => route.abort('failed'));
  await panel(page).getByRole('button', { name: 'Prepare the request' }).click();
  await expect(drawer(page)).toHaveCount(0);
  await expect(panel(page).getByRole('listitem').first()).toContainText('may block requests from a browser');

  // The network log has each request, and no key.
  await closeSheet(page);
  await page.getByRole('link', { name: 'See the network log' }).click();
  await expect(page.locator('tbody tr')).toHaveCount(2);
  await expect(page.getByRole('main')).not.toContainText('gsk_test');
});

test('Pen mode loads no Assistant code, and Reader mode loads it', async ({ page }) => {
  const loaded: string[] = [];
  page.on('request', (request) => {
    loaded.push(new URL(request.url()).pathname);
  });
  await newProject(page);
  await page.keyboard.type('Quiet words.');
  await saved(page);
  expect(loaded.filter((p) => /AssistantPanel|ai-model/.test(p))).toEqual([]);
  await expect(page.getByRole('button', { name: 'Assistant', exact: true })).toHaveCount(0);

  await switchTo(page, 'Reader');
  await openAssistant(page);
  expect(loaded.some((p) => p.includes('AssistantPanel'))).toBe(true);
  // The in-browser model's library loads only when the writer sends with it.
  expect(loaded.filter((p) => p.includes('ai-model'))).toEqual([]);

  // Back to Pen: the panel and its button go.
  await closeSheet(page);
  await switchTo(page, 'Pen');
  await expect(panel(page)).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Assistant', exact: true })).toHaveCount(0);
});

for (const theme of ['ink', 'paper', 'sepia'] as const) {
  test(`the Assistant, the drawer and the key dialog have no serious axe issues in ${theme}`, async ({
    page,
  }) => {
    await page.addInitScript((t) => {
      localStorage.setItem('vlo:preferences', JSON.stringify({ theme: t, calm: true }));
    }, theme);
    await newProject(page);
    await page.keyboard.type('A short scene for the check.');
    await saved(page);
    await switchTo(page, 'Co-writer');
    await openAssistant(page);
    expect(await seriousIssues(page)).toEqual([]);
    await panel(page).getByRole('button', { name: 'Change engine' }).click();
    expect(await seriousIssues(page)).toEqual([]);
    await panel(page).getByLabel('Where the AI runs').selectOption('openrouter');
    await panel(page).getByRole('button', { name: 'Add a key' }).click();
    expect(await seriousIssues(page)).toEqual([]);
    await page
      .getByRole('dialog', { name: 'Key for OpenRouter' })
      .getByRole('button', { name: 'Cancel' })
      .click();
    await panel(page).getByRole('button', { name: 'Cancel' }).click();
    await panel(page).getByLabel('What to ask').selectOption('brainstorm');
    await panel(page).getByLabel('Ideas for').fill('the next scene');
    await panel(page).getByRole('button', { name: 'Prepare the request' }).click();
    await expect(drawer(page)).toContainText('This request stays in this browser.');
    expect(await seriousIssues(page)).toEqual([]);
  });
}
