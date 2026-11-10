import { Editor } from '@tiptap/core';
import * as Y from 'yjs';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { KEEP_AI_MARKS } from '@/features/editor/extensions/aiOrigin';
import { proseExtensions } from '@/features/editor/extensions/prose';
import { AI_ORIGIN } from '@/features/editor/format/aiOrigin';
import { docText } from '@/features/editor/itemText';
import { snapshotsOf } from '@/features/snapshots/snapshots';
import { paragraphDiff } from '@/features/versions/paragraphDiff';
import {
  BEFORE_SWITCH,
  BEFORE_TAKE,
  compare,
  deleteVersion,
  renameVersion,
  saveVersion,
  switchVersion,
  takeBlock,
  undoDelete,
  versionDoc,
  versionsOf,
} from '@/features/versions/versions';
import { clock } from '@/lib/clock';
import { db, MAX_VERSIONS, type Item } from '@/lib/db';

/* Named versions of an item (roadmap F55, plan Task K2, Review Focus 2). */

const item = { id: 'item-1', projectId: 'project-1' };
let editor: Editor;
let doc: Y.Doc;
const realNow = clock.now.bind(clock);
let now = 1_000;

const AI = { provider: 'Groq', model: 'llama', createdAt: 1 };

function mount() {
  doc = new Y.Doc();
  const host = document.createElement('div');
  document.body.append(host);
  editor = new Editor({ element: host, extensions: proseExtensions(doc) });
}

const text = () => docText(editor.state.doc, 'prose');
const json = () => JSON.stringify(editor.getJSON());

/** Sets paragraphs, the second one marked as AI text. */
function setParagraphs(...lines: string[]) {
  // The meta keeps the AI mark, as an AI insert does.
  editor
    .chain()
    .setMeta(KEEP_AI_MARKS, true)
    .setContent({
      type: 'doc',
      content: lines.map((line, index) => ({
        type: 'paragraph',
        content: [
          { type: 'text', text: line, ...(index === 1 ? { marks: [{ type: AI_ORIGIN, attrs: AI }] } : {}) },
        ],
      })),
    })
    .run();
}

beforeEach(async () => {
  await db.open();
  clock.now = () => (now += 1_000);
  const row: Item = {
    ...item,
    parentId: null,
    kind: 'scene',
    title: 'Scene 1',
    status: 'draft',
    order: 'a0',
    wordCount: 0,
    createdAt: 0,
    updatedAt: 0,
  };
  await db.items.add(row);
  mount();
});
afterEach(async () => {
  clock.now = realNow;
  editor.destroy();
  doc.destroy();
  document.body.replaceChildren();
  await db.delete();
});

describe('paragraphDiff', () => {
  test('pairs a changed paragraph and keeps the same ones', () => {
    expect(paragraphDiff(['a', 'b', 'c'], ['a', 'B', 'c'])).toEqual([
      { kind: 'same', a: 0, b: 0 },
      { kind: 'changed', a: 1, b: 1 },
      { kind: 'same', a: 2, b: 2 },
    ]);
  });

  test('a paragraph only in one version has no partner', () => {
    expect(paragraphDiff(['a', 'c'], ['a', 'b', 'c'])).toEqual([
      { kind: 'same', a: 0, b: 0 },
      { kind: 'onlyB', b: 1 },
      { kind: 'same', a: 1, b: 2 },
    ]);
    expect(paragraphDiff(['a', 'x', 'y'], ['a'])).toEqual([
      { kind: 'same', a: 0, b: 0 },
      { kind: 'onlyA', a: 1 },
      { kind: 'onlyA', a: 2 },
    ]);
  });

  test('a moved paragraph shows as gone in one place and new in the other', () => {
    const rows = paragraphDiff(['a', 'b', 'c'], ['c', 'a', 'b']);
    expect(rows.filter((r) => r.kind === 'same')).toHaveLength(2);
    expect(rows).toContainEqual({ kind: 'onlyB', b: 0 });
    expect(rows).toContainEqual({ kind: 'onlyA', a: 2 });
  });
});

describe('versions', () => {
  test('a switch and a switch back give the same text and marks', async () => {
    setParagraphs('The sea comes in.', 'The gulls wake.');
    const before = json();
    expect(before).toContain(AI_ORIGIN);
    await saveVersion(item, editor, doc, 'prose', 'Darker ending');
    setParagraphs('The sea goes out.', 'Night falls.');
    const edited = json();

    const [darker] = await versionsOf(item.id);
    await switchVersion(item, editor, doc, 'prose', darker?.id ?? '');
    expect(json()).toBe(before);
    expect((await db.items.get(item.id))?.versionName).toBe('Darker ending');
    // The text that the switch replaced is now the version "Main".
    const [main] = await versionsOf(item.id);
    expect(main).toMatchObject({ name: 'Main', text: 'The sea goes out.\n\nNight falls.' });

    await switchVersion(item, editor, doc, 'prose', main?.id ?? '');
    expect(json()).toBe(edited);
    expect((await db.items.get(item.id))?.versionName).toBeUndefined();
    expect((await versionsOf(item.id)).map((v) => v.name)).toEqual(['Darker ending']);
  });

  test('a switch saves a snapshot of the text it replaces first', async () => {
    setParagraphs('One.');
    await saveVersion(item, editor, doc, 'prose', 'B');
    setParagraphs('Two.');
    const [b] = await versionsOf(item.id);
    await switchVersion(item, editor, doc, 'prose', b?.id ?? '');
    const [newest] = await snapshotsOf(item.id);
    expect(newest).toMatchObject({ label: BEFORE_SWITCH, text: 'Two.' });
  });

  test('names are unique for each item, in any case, and the count has a limit', async () => {
    setParagraphs('One.');
    await expect(saveVersion(item, editor, doc, 'prose', '  main ')).rejects.toThrow(
      'This item has a version named “main”.',
    );
    await expect(saveVersion(item, editor, doc, 'prose', '   ')).rejects.toThrow('Give the version a name.');
    for (let n = 0; n < MAX_VERSIONS; n += 1) await saveVersion(item, editor, doc, 'prose', `V${String(n)}`);
    await expect(saveVersion(item, editor, doc, 'prose', 'One more')).rejects.toThrow(/at most/);
  });

  test('rename works for the active version and the others', async () => {
    setParagraphs('One.');
    await saveVersion(item, editor, doc, 'prose', 'B');
    await renameVersion(item.id, null, 'First draft');
    expect((await db.items.get(item.id))?.versionName).toBe('First draft');
    const [b] = await versionsOf(item.id);
    await expect(renameVersion(item.id, b?.id ?? '', 'first draft')).rejects.toThrow(/has a version named/);
    await renameVersion(item.id, b?.id ?? '', 'Second draft');
    expect((await versionsOf(item.id))[0]?.name).toBe('Second draft');
  });

  test('a delete gives the row back, and an undo restores it', async () => {
    setParagraphs('One.');
    await saveVersion(item, editor, doc, 'prose', 'B');
    const [b] = await versionsOf(item.id);
    const row = await deleteVersion(b?.id ?? '');
    expect(await versionsOf(item.id)).toEqual([]);
    if (row) await undoDelete(row);
    expect(await versionsOf(item.id)).toEqual([b]);
  });
});

describe('Use this', () => {
  test('takes one changed paragraph with its marks, and nothing else', async () => {
    setParagraphs('The sea comes in.', 'The gulls wake.', 'Morning.');
    await saveVersion(item, editor, doc, 'prose', 'B');
    setParagraphs('The sea goes out.', 'Night falls.', 'Morning.');
    const [b] = await versionsOf(item.id);
    const state = b?.state ?? new Uint8Array();

    await takeBlock(item, editor, doc, 'prose', state, 1);
    expect(text()).toBe('The sea goes out.\n\nThe gulls wake.\n\nMorning.');
    expect(editor.state.doc.child(1).firstChild?.marks.map((m) => m.type.name)).toEqual([AI_ORIGIN]);
    const [newest] = await snapshotsOf(item.id);
    expect(newest).toMatchObject({
      label: BEFORE_TAKE,
      text: 'The sea goes out.\n\nNight falls.\n\nMorning.',
    });
    // The comparison now shows that paragraph as the same.
    expect(compare(editor.state.doc, versionDoc(editor, state)).rows[1]).toEqual({
      kind: 'same',
      a: 1,
      b: 1,
    });
  });

  test('a paragraph only in the other version goes in after the paragraph before it', async () => {
    setParagraphs('One.', 'Two.', 'Three.');
    await saveVersion(item, editor, doc, 'prose', 'B');
    setParagraphs('One.', 'Three.');
    const [b] = await versionsOf(item.id);
    await takeBlock(item, editor, doc, 'prose', b?.state ?? new Uint8Array(), 1);
    expect(text()).toBe('One.\n\nTwo.\n\nThree.');
  });
});
