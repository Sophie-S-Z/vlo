import * as Y from 'yjs';
import { afterEach, beforeEach, expect, test } from 'vitest';
import { captureNote, INBOX, sharedText } from '@/features/capture/capture';
import { createProject } from '@/features/library/projects';
import { db } from '@/lib/db';
import { readItemUpdate } from '@/lib/ydocs';

/* Plan Task H8 (roadmap F48): quick capture. */

beforeEach(async () => {
  await db.open();
});
afterEach(async () => {
  await db.delete();
  for (const d of await indexedDB.databases())
    if (d.name?.startsWith('vlo-item-')) indexedDB.deleteDatabase(d.name);
});

async function novel() {
  return (await createProject({ title: 'Salt Year', templates: ['novel'] })).project;
}

test('the first capture makes the Inbox at the top of the binder, and the second uses it', async () => {
  const project = await novel();
  const first = await captureNote(project.id, { title: 'Harbour', text: 'Gulls at dawn.' });
  const second = await captureNote(project.id, { text: 'Rope burns.\nSalt on the deck.' });
  expect(first.projectId).toBe(project.id);

  const top = await db.items
    .where('projectId')
    .equals(project.id)
    .filter((i) => i.parentId === null)
    .sortBy('order');
  expect(top.map((i) => i.title)).toEqual([INBOX, 'Chapter 1']);
  const inbox = top[0];
  const notes = await db.items
    .where('projectId')
    .equals(project.id)
    .filter((i) => i.parentId === inbox?.id)
    .sortBy('order');
  expect(notes.map((n) => [n.id, n.kind, n.title, n.wordCount])).toEqual([
    [first.itemId, 'note', 'Harbour', 3],
    [second.itemId, 'note', 'Rope burns.', 6],
  ]);
});

test('the note keeps its line breaks, in the text and in the editor document', async () => {
  const project = await novel();
  const { itemId } = await captureNote(project.id, { text: '  Line one\nLine two\n\nA new paragraph.  ' });
  expect((await db.itemTexts.get(itemId))?.text).toBe('Line one\nLine two\n\nA new paragraph.');
  const doc = new Y.Doc();
  Y.applyUpdate(doc, await readItemUpdate(itemId));
  // The check leaves out the default paragraph attributes. Yjs writes element names in lower case.
  expect(
    doc
      .getXmlFragment('default')
      .toJSON()
      .replaceAll(/ \w+="false"/g, ''),
  ).toBe(
    '<paragraph>Line one<hardbreak></hardbreak>Line two</paragraph><paragraph>A new paragraph.</paragraph>',
  );
  doc.destroy();
});

test('a shared link is a line of text, and a link that is in the text already comes once', () => {
  expect(sharedText('Tides turn twice a day.', 'https://example.com/tides')).toBe(
    'Tides turn twice a day.\nhttps://example.com/tides',
  );
  expect(sharedText('See https://example.com/tides', 'https://example.com/tides')).toBe(
    'See https://example.com/tides',
  );
  expect(sharedText('', ' https://example.com/tides ')).toBe('https://example.com/tides');
});

test('a device with no project gets a new Open writing project, and an empty note is refused', async () => {
  await expect(captureNote(null, { text: '  \n ' })).rejects.toThrow('Type or paste the text of the note.');
  expect(await db.projects.count()).toBe(0);

  const { projectId, itemId } = await captureNote(null, { text: 'A first line.' });
  const project = await db.projects.get(projectId);
  expect(project?.templates).toEqual(['open']);
  const note = await db.items.get(itemId);
  const inbox = note?.parentId ? await db.items.get(note.parentId) : undefined;
  expect([inbox?.kind, inbox?.title, note?.title]).toEqual(['part', INBOX, 'A first line.']);
});
