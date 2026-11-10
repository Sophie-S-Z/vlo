import { Editor } from '@tiptap/core';
import { ySyncPluginKey } from '@tiptap/y-tiptap';
import * as Y from 'yjs';
import { afterEach, beforeAll, beforeEach, describe, expect, test } from 'vitest';
import { resetSigningKey } from '@/features/authorship/keys';
import { exportRecord, flushEntry, resetPending } from '@/features/authorship/record';
import { AuthorshipCount, DICTATION } from '@/features/authorship/sourcePlugin';
import { verifyRecord } from '@/features/authorship/verify';
import { insertAiText } from '@/features/editor/extensions/aiOrigin';
import { proseExtensions } from '@/features/editor/extensions/prose';
import { db } from '@/lib/db';

/* Plan Task K5 (roadmap F54, decision K1): the counts by source, the chain and the record file. */

beforeAll(() => {
  Element.prototype.scrollIntoView = () => undefined;
});

const editors: Editor[] = [];

function mount(projectId = 'p1') {
  const host = document.createElement('div');
  document.body.append(host);
  const editor = new Editor({
    element: host,
    extensions: [...proseExtensions(new Y.Doc()), AuthorshipCount.configure({ projectId })],
  });
  editors.push(editor);
  return editor;
}

/** Inserts `text` at the end, with a transaction meta when given. */
function write(editor: Editor, text: string, meta?: [string | typeof ySyncPluginKey, unknown]) {
  const tr = editor.state.tr.insertText(text, editor.state.doc.content.size - 1);
  if (meta) tr.setMeta(meta[0], meta[1]);
  editor.view.dispatch(tr);
}

const recordText = async (projectId = 'p1') => (await exportRecord(projectId)) ?? '';

beforeEach(async () => {
  await db.open();
});

afterEach(async () => {
  for (const e of editors.splice(0)) e.destroy();
  document.body.replaceChildren();
  resetPending();
  resetSigningKey();
  await db.delete();
});

describe('the counts by source', () => {
  test('typing, a paste, a drop, dictation, an AI insert and a delete each count in their field', async () => {
    const editor = mount();
    write(editor, 'Mira rows.');
    write(editor, ' Pasted', ['uiEvent', 'paste']);
    write(editor, ' Drop', ['uiEvent', 'drop']);
    write(editor, ' Said', [DICTATION, true]);
    // The draft takes a space to stay apart from the word before it.
    insertAiText(editor, 'The AI.', { provider: 'Groq', model: 'm', createdAt: 1 }, 'prose');
    editor.view.dispatch(editor.state.tr.delete(1, 6));
    await flushEntry('p1');
    const [entry] = await db.authorship.toArray();
    expect(entry).toMatchObject({ typed: 10, pasted: 12, dictated: 5, ai: 8, deleted: 5, seq: 0, prev: '' });
    expect(entry?.minutes).toBe(1);
  });

  test('a change from Yjs counts nothing, and no change makes no entry', async () => {
    const editor = mount();
    write(editor, 'From another tab.', [ySyncPluginKey, { isChangeOrigin: true }]);
    await flushEntry('p1');
    expect(await db.authorship.count()).toBe(0);
  });
});

describe('the chain and the record file', () => {
  test('each entry links to the one before, and the file checks', async () => {
    const editor = mount();
    write(editor, 'One.');
    await flushEntry('p1');
    write(editor, ' Two.');
    await flushEntry('p1');
    const entries = (await db.authorship.toArray()).sort((a, b) => a.seq - b.seq);
    expect(entries.map((e) => e.seq)).toEqual([0, 1]);
    expect(entries[1]?.prev).toBe(entries[0]?.hash);
    expect(entries[0]?.key).toMatchObject({ kty: 'EC', crv: 'P-256' });
    expect(entries[1]?.key).toBeUndefined();
    const result = await verifyRecord(await recordText());
    expect(result).toMatchObject({ ok: true, totals: { typed: 9 }, devices: [{ entries: 2 }] });
  });

  test('two devices give two chains that both check', async () => {
    const editor = mount();
    write(editor, 'First device.');
    await flushEntry('p1');
    // A new device: a new key in a fresh browser.
    await db.appMeta.clear();
    resetSigningKey();
    write(editor, ' Second device.');
    await flushEntry('p1');
    const result = await verifyRecord(await recordText());
    expect(result.ok && result.devices.map((d) => d.entries)).toEqual([1, 1]);
  });

  test('the file holds no text and no titles, and each project has its own chain', async () => {
    await db.projects.add({ id: 'p1', title: 'The Harbour Secret' } as never);
    const editor = mount();
    write(editor, 'Mira hid the ledger.');
    await flushEntry('p1');
    const other = mount('p2');
    write(other, 'Elsewhere.');
    await flushEntry('p2');
    const file = await recordText();
    expect(file).not.toMatch(/Harbour|Mira|ledger|p1|Elsewhere/);
    expect((JSON.parse(file) as { entries: unknown[] }).entries).toHaveLength(1);
    expect((await db.authorship.where('projectId').equals('p2').first())?.seq).toBe(0);
  });
});
