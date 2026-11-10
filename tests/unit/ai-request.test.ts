import { EditorState, TextSelection } from '@tiptap/pm/state';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { buildAiRequest, type RequestInput } from '@/features/ai/request';
import { db, type Project } from '@/lib/db';
import { item, project, proseSchema } from './export-fixtures';

/* The AI request builder (architecture review finding 3): the privacy order of a memoir request. */

const PROJECT: Project = { id: 'p1', ...project('memoir'), createdAt: 0, updatedAt: 0, aiMode: 'reader' };
const OPEN = item('m1', 'memory', 'The coast');
const OTHER = item('m2', 'memory', 'The dog');

/** An editor state of one paragraph, with "Gran" marked as Rosa, and `selected` selected. */
function openState(selected = ''): EditorState {
  const doc = proseSchema.nodeFromJSON({
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        content: [
          { type: 'text', text: 'Gran', marks: [{ type: 'privateName', attrs: { personId: 'rosa' } }] },
          { type: 'text', text: ' and Aunt Rosa drove us to the coast in 1994.' },
        ],
      },
    ],
  });
  const state = EditorState.create({ doc });
  const at = doc.textContent.indexOf(selected) + 1;
  return selected === ''
    ? state
    : state.apply(state.tr.setSelection(TextSelection.create(doc, at, at + selected.length)));
}

function input(extra: Partial<RequestInput> = {}): RequestInput {
  return {
    project: PROJECT,
    items: [OPEN, OTHER],
    action: 'ask',
    question: 'Why did Rosa leave the city?',
    words: 100,
    instruction: '',
    topic: '',
    open: { item: OPEN, kind: 'prose', state: openState() },
    inBrowser: false,
    ...extra,
  };
}

beforeEach(async () => {
  await db.open();
  await db.people.add({
    id: 'rosa',
    projectId: 'p1',
    label: 'Rosa',
    variants: [
      { real: 'Aunt Rosa', alias: 'Aunt Maria' },
      { real: 'Rosa', alias: 'Maria' },
    ],
  });
  await db.itemTexts.bulkPut([
    { itemId: 'm1', projectId: 'p1', text: 'An older copy of the open memory.', updatedAt: 0 },
    { itemId: 'm2', projectId: 'p1', text: 'Uncle Teo stayed behind. Rosa never said why.', updatedAt: 0 },
  ]);
});

afterEach(async () => {
  await db.delete();
});

describe('buildAiRequest', () => {
  test('a memoir request holds no real name and no marked name, and the answer gets them back', async () => {
    const built = await buildAiRequest(input());
    if (!built.ok) throw new Error(built.message);
    const body = JSON.stringify(built.request);
    expect(body).not.toMatch(/Rosa|Gran/);
    expect(body).toContain('Aunt Maria');
    // The passages come from the stored copies, with the open item from the editor.
    expect(body).toContain('Maria never said why');
    expect(body).not.toContain('An older copy');
    expect(built.aliased).toBe(true);
    expect(built.people[0]?.variants.map((v) => v.real)).toContain('Gran');
  });

  test('a rewrite keeps the selected words as its target, and its request is aliased too', async () => {
    const built = await buildAiRequest(
      input({ action: 'rewrite', open: { item: OPEN, kind: 'prose', state: openState('Aunt Rosa') } }),
    );
    if (!built.ok) throw new Error(built.message);
    expect(built.target?.text).toBe('Aunt Rosa');
    expect(JSON.stringify(built.request)).not.toMatch(/Rosa|Gran/);
  });

  test('the reader panel sends the aliased Codex notes of the names in the text only (F61)', async () => {
    await db.codex.bulkAdd([
      {
        id: 'c1',
        projectId: 'p1',
        kind: 'character',
        name: 'Aunt Rosa',
        aliases: [],
        note: 'Rosa taught me to swim.',
        order: 'a0',
      },
      {
        id: 'c2',
        projectId: 'p1',
        kind: 'character',
        name: 'Uncle Teo',
        aliases: [],
        note: 'He kept a secret.',
        order: 'a1',
      },
    ]);
    const built = await buildAiRequest(input({ action: 'panel' }));
    if (!built.ok) throw new Error(built.message);
    const body = JSON.stringify(built.request);
    expect(body).toContain('Aunt Maria (character): Maria taught me to swim.');
    expect(body).not.toMatch(/Rosa|Gran|secret/);
  });

  test('a shared Codex note of a series gets the aliases of the People of each book (F59)', async () => {
    await db.series.add({ id: 's1', title: 'Coast', projectIds: ['p1', 'p2'], styleSheet: [], updatedAt: 0 });
    await db.people.add({
      id: 'hale',
      projectId: 'p2',
      label: 'Margaret',
      variants: [{ real: 'Margaret Hale', alias: 'Anne Lowe' }],
    });
    await db.codex.add({
      id: 'c3',
      projectId: 's1',
      kind: 'character',
      name: 'Aunt Rosa',
      aliases: [],
      note: 'Margaret Hale was her sister.',
      order: 'a0',
    });
    const built = await buildAiRequest(input({ action: 'panel' }));
    if (!built.ok) throw new Error(built.message);
    const body = JSON.stringify(built.request);
    expect(body).toContain('Aunt Maria (character): Anne Lowe was her sister.');
    expect(body).not.toMatch(/Margaret|Hale/);
  });

  test('with the alias switch off, the request keeps the real names', async () => {
    const off: Project = { ...PROJECT, settings: { ...PROJECT.settings, aliasAiRequests: false } };
    const built = await buildAiRequest(input({ project: off }));
    if (!built.ok) throw new Error(built.message);
    expect(JSON.stringify(built.request)).toContain('Aunt Rosa');
    expect(built.aliased).toBe(false);
  });

  test('a failed read of the people sends nothing', async () => {
    db.close();
    expect(await buildAiRequest(input({ action: 'feedback' }))).toEqual({
      ok: false,
      message: 'Vlo could not read the private names of this memoir, so it sent nothing.',
    });
  });

  test('a co-writer action needs an open item, and the in-browser model refuses a long request', async () => {
    expect(await buildAiRequest(input({ action: 'rewrite', open: undefined }))).toEqual({
      ok: false,
      message: 'Open an item first.',
    });
    await db.itemTexts.put({ itemId: 'm2', projectId: 'p1', text: 'word '.repeat(20_000), updatedAt: 0 });
    const long = await buildAiRequest(input({ inBrowser: true, question: 'word '.repeat(5_000) }));
    expect(long).toMatchObject({ ok: false, message: expect.stringContaining('too long') as unknown });
  });
});
