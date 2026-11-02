import { Editor } from '@tiptap/core';
import * as Y from 'yjs';
import { afterEach, beforeEach, expect, test } from 'vitest';
import { proseExtensions } from '@/features/editor/extensions/prose';
import { poemExtensions } from '@/features/editor/extensions/poem';
import { docText } from '@/features/editor/itemText';
import { parsePoemText, poemDataFromDoc, poemDataToJSON } from '@/features/editor/poemText';
import { BEFORE_RESTORE, restoreSnapshot, snapshotsOf, takeSnapshot } from '@/features/snapshots/snapshots';
import { clock } from '@/lib/clock';
import { db } from '@/lib/db';
import { YFRAGMENT, docFromUpdate } from '@/lib/ydocs';

const item = { id: 'item-1', projectId: 'project-1' };
let editor: Editor;
let doc: Y.Doc;
const realNow = clock.now.bind(clock);
let now = 1_000;

function mount(kind: 'prose' | 'poem') {
  doc = new Y.Doc();
  const host = document.createElement('div');
  document.body.append(host);
  editor = new Editor({
    element: host,
    extensions: kind === 'prose' ? proseExtensions(doc) : poemExtensions(doc, { tabSpaces: 4 }),
  });
}

beforeEach(async () => {
  await db.open();
  clock.now = () => (now += 1_000);
});
afterEach(async () => {
  clock.now = realNow;
  editor.destroy();
  doc.destroy();
  document.body.replaceChildren();
  await db.delete();
});

test('a snapshot stores the Yjs state and the text', async () => {
  mount('prose');
  editor.commands.setContent('<p>The tide goes out.</p>');
  const snapshot = await takeSnapshot(item, doc, 'The tide goes out.', 'First draft');
  const stored = await db.snapshots.get(snapshot.id);
  expect(stored).toMatchObject({ itemId: 'item-1', projectId: 'project-1', label: 'First draft', text: 'The tide goes out.' });
  const copy = docFromUpdate(stored?.state ?? new Uint8Array());
  expect(copy.getXmlFragment(YFRAGMENT).toString()).toContain('The tide goes out.');
});

test('snapshotsOf lists an item’s snapshots newest first', async () => {
  mount('prose');
  await takeSnapshot(item, doc, 'one');
  await takeSnapshot(item, doc, 'two');
  await takeSnapshot({ id: 'other', projectId: 'project-1' }, doc, 'other');
  expect((await snapshotsOf('item-1')).map((s) => s.text)).toEqual(['two', 'one']);
});

test('restore saves the current text first, then shows the old text in the same document', async () => {
  mount('prose');
  editor.commands.setContent('<p>The tide goes out.</p>');
  const old = await takeSnapshot(item, doc, 'The tide goes out.');
  editor.commands.setContent('<p>The sea comes in.</p>');
  const fragment = doc.getXmlFragment(YFRAGMENT);

  await restoreSnapshot(item, editor, doc, old.id, 'prose');

  expect(docText(editor.state.doc, 'prose')).toBe('The tide goes out.');
  expect(fragment.toString()).toContain('The tide goes out.');
  expect(doc.getXmlFragment(YFRAGMENT)).toBe(fragment);
  const [newest] = await snapshotsOf('item-1');
  expect(newest).toMatchObject({ label: BEFORE_RESTORE, text: 'The sea comes in.' });
});

test('restoring a poem keeps every space, stanza and hanging indent', async () => {
  mount('poem');
  editor.commands.setContent(poemDataToJSON(parsePoemText('Salt\n    on the sill\n\nTide\n')));
  editor.commands.setTextSelection(3);
  editor.commands.setHanging(3);
  const before = poemDataFromDoc(editor.state.doc);
  const old = await takeSnapshot(item, doc, docText(editor.state.doc, 'poem'));
  editor.commands.setContent(poemDataToJSON(parsePoemText('Gone\n')));

  await restoreSnapshot(item, editor, doc, old.id, 'poem');

  expect(poemDataFromDoc(editor.state.doc)).toEqual(before);
});

test('restore refuses a snapshot of another item', async () => {
  mount('prose');
  const other = await takeSnapshot({ id: 'other', projectId: 'project-1' }, doc, '');
  await expect(restoreSnapshot(item, editor, doc, other.id, 'prose')).rejects.toThrow(
    'Vlo could not find that snapshot.',
  );
});
