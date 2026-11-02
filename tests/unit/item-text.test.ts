import { Editor } from '@tiptap/core';
import * as Y from 'yjs';
import { afterEach, beforeEach, expect, test } from 'vitest';
import { proseExtensions } from '@/features/editor/extensions/prose';
import { docText, writeItemText } from '@/features/editor/itemText';
import { createProject } from '@/features/library/projects';
import { db } from '@/lib/db';

beforeEach(async () => {
  await db.open();
  Object.defineProperty(navigator, 'storage', {
    configurable: true,
    value: { persist: () => Promise.resolve(true) },
  });
});
afterEach(async () => {
  Reflect.deleteProperty(navigator, 'storage');
  await db.delete();
});

test('writeItemText stores the text, the word count and the project change time', async () => {
  const { project, firstItemId } = await createProject({ title: 'Debt', template: 'novel' });
  const item = await db.items.get(firstItemId);
  if (!item) throw new Error('no item');
  await writeItemText(item, "Mira's ledger was wet. It was 1994.", 'prose');
  expect((await db.itemTexts.get(firstItemId))?.text).toBe("Mira's ledger was wet. It was 1994.");
  expect((await db.items.get(firstItemId))?.wordCount).toBe(7);
  expect((await db.items.get(firstItemId))?.lineCount).toBeUndefined();
  expect((await db.projects.get(project.id))?.updatedAt).toBeGreaterThanOrEqual(project.updatedAt);
});

test('writeItemText counts lines for poems', async () => {
  const { firstItemId } = await createProject({ title: 'Salt', template: 'poetry' });
  const item = await db.items.get(firstItemId);
  if (!item) throw new Error('no item');
  await writeItemText(item, 'Salt on the sill.\n    The tide goes out\n\nI keep\n', 'poem');
  expect(await db.items.get(firstItemId)).toMatchObject({ wordCount: 10, lineCount: 3 });
});

test('writeItemText does nothing for a deleted item', async () => {
  const { firstItemId } = await createProject({ title: 'Salt', template: 'poetry' });
  const item = await db.items.get(firstItemId);
  if (!item) throw new Error('no item');
  await db.items.delete(firstItemId);
  await writeItemText(item, 'gone', 'poem');
  expect(await db.itemTexts.get(firstItemId)).toBeUndefined();
});

test('docText separates prose blocks with a blank line and writes scene breaks as #', () => {
  const editor = new Editor({ extensions: proseExtensions(new Y.Doc()) });
  editor.commands.setContent('<p>One two.</p><div data-scene-break></div><p>Three.</p>');
  expect(docText(editor.state.doc, 'prose')).toBe('One two.\n\n#\n\nThree.');
  editor.destroy();
});
