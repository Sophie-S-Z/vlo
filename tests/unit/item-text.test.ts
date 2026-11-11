import { Editor } from '@tiptap/core';
import * as Y from 'yjs';
import { afterEach, beforeEach, expect, test } from 'vitest';
import { proseExtensions } from '@/features/editor/extensions/prose';
import { docText, refreshItemText, writeItemText } from '@/features/editor/itemText';
import { withoutNotes } from '@/features/editor/format/notes';
import { dayStartKey, localDay, wordsToday } from '@/features/editor/stats/stats';
import { createProject, updateProjectSettings } from '@/features/library/projects';
import { dayKey } from '@/features/progress/streaks';
import { db } from '@/lib/db';
import { countWords } from '@/lib/wordcount';

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
  const { project, firstItemId } = await createProject({ title: 'Debt', templates: ['novel'] });
  const item = await db.items.get(firstItemId);
  if (!item) throw new Error('no item');
  await writeItemText(item, "Mira's ledger was wet. It was 1994.", 'prose');
  expect((await db.itemTexts.get(firstItemId))?.text).toBe("Mira's ledger was wet. It was 1994.");
  expect((await db.items.get(firstItemId))?.wordCount).toBe(7);
  expect((await db.items.get(firstItemId))?.lineCount).toBeUndefined();
  expect((await db.projects.get(project.id))?.updatedAt).toBeGreaterThanOrEqual(project.updatedAt);
});

// Plan Task H9 (roadmap F38): the stored count holds the unit of the project's language.
test('a Japanese item stores characters, and a language change counts every item again', async () => {
  const { project, firstItemId } = await createProject({ title: 'Kyoto', templates: ['novel'] });
  const item = await db.items.get(firstItemId);
  if (!item) throw new Error('no item');
  const body = '東京へ行く。Vlo は便利';
  await writeItemText(item, `${body}\n\nNotes\n1. 注意`, 'prose', body, 'ja');
  expect((await db.items.get(firstItemId))?.wordCount).toBe(9);

  // Today's count started at 4 characters, so the writer added 5 today.
  await db.appMeta.put({ key: dayStartKey(project.id), value: { day: localDay(), start: 4 } });
  await updateProjectSettings(project.id, { language: 'en' });
  expect((await db.items.get(firstItemId))?.wordCount).toBe(countWords(body));
  // The start moves with the count, so today's count stays the same.
  expect(await wordsToday(project.id, countWords(body))).toBe(5);
  await updateProjectSettings(project.id, { language: 'ja' });
  // The notes stay out of the count.
  expect((await db.items.get(firstItemId))?.wordCount).toBe(9);
});

test('withoutNotes takes the notes off prose and off a poem', () => {
  expect(withoutNotes('The tide.\n\nNotes\n1. A note.')).toBe('The tide.');
  expect(withoutNotes('Salt on the sill.\n  The tide\nNotes\n1. A note.\n')).toBe(
    'Salt on the sill.\n  The tide',
  );
  expect(withoutNotes('No notes here.')).toBe('No notes here.');
});

test('writeItemText counts lines for poems', async () => {
  const { firstItemId } = await createProject({ title: 'Salt', templates: ['poetry'] });
  const item = await db.items.get(firstItemId);
  if (!item) throw new Error('no item');
  await writeItemText(item, 'Salt on the sill.\n    The tide goes out\n\nI keep\n', 'poem');
  expect(await db.items.get(firstItemId)).toMatchObject({ wordCount: 10, lineCount: 3 });
});

test('writeItemText does nothing for a deleted item', async () => {
  const { firstItemId } = await createProject({ title: 'Salt', templates: ['poetry'] });
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

test('docText keeps a line break between words, so they count apart', () => {
  const editor = new Editor({ extensions: proseExtensions(new Y.Doc()) });
  editor.commands.setContent('<p>Salt<br>Tide</p>');
  expect(docText(editor.state.doc, 'prose')).toBe('Salt\nTide');
  editor.destroy();
});

test('writeItemText adds the net change in words to the day', async () => {
  const { project, firstItemId } = await createProject({ title: 'Debt', templates: ['novel'] });
  const item = await db.items.get(firstItemId);
  if (!item) throw new Error('no item');
  const today = dayKey(Date.now());
  await writeItemText(item, 'one two three four five', 'prose');
  expect((await db.projects.get(project.id))?.settings.wordsByDay).toEqual({ [today]: 5 });
  await writeItemText(item, 'one two three', 'prose');
  expect((await db.projects.get(project.id))?.settings.wordsByDay).toEqual({ [today]: 3 });
  // The same text again adds nothing.
  await writeItemText(item, 'one two three', 'prose');
  expect((await db.projects.get(project.id))?.settings.wordsByDay).toEqual({ [today]: 3 });
  await writeItemText(item, '', 'prose');
  expect((await db.projects.get(project.id))?.settings.wordsByDay).toEqual({});
  // Words that were there before today count against today, so a cut and a paste add nothing.
  await db.items.update(item.id, { wordCount: 4 });
  await writeItemText(item, '', 'prose');
  expect((await db.projects.get(project.id))?.settings.wordsByDay).toEqual({ [today]: -4 });
  await writeItemText(item, 'one two three four', 'prose');
  expect((await db.projects.get(project.id))?.settings.wordsByDay).toEqual({});
});

test('refreshItemText brings a copy that missed the last words up to date, and keeps it for an empty editor', async () => {
  const { firstItemId } = await createProject({ title: 'Debt', templates: ['novel'] });
  const item = await db.items.get(firstItemId);
  if (!item) throw new Error('no item');
  // The tab closed in the save pause: the copy has the first sentence only.
  await writeItemText(item, 'The rain came.', 'prose');
  const editor = new Editor({ extensions: proseExtensions(new Y.Doc()) });

  // An editor that has not drawn its document yet leaves the copy alone.
  await refreshItemText(item, editor.state.doc, 'prose');
  expect((await db.itemTexts.get(firstItemId))?.text).toBe('The rain came.');

  editor.commands.setContent('<p>The rain came. The river rose.</p>');
  await refreshItemText(item, editor.state.doc, 'prose');
  expect((await db.itemTexts.get(firstItemId))?.text).toBe('The rain came. The river rose.');
  expect((await db.items.get(firstItemId))?.wordCount).toBe(6);
  editor.destroy();
});
