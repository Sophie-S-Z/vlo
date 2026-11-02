import * as Y from 'yjs';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { addItem, deleteItem, moveItem, nextTitle, updateItem } from '@/features/binder/items';
import { createProject } from '@/features/library/projects';
import { db } from '@/lib/db';
import { itemDocName } from '@/lib/itemDocName';
import { openItemDoc } from '@/lib/ydocs';

beforeEach(async () => {
  await db.open();
  Object.defineProperty(navigator, 'storage', {
    configurable: true,
    value: { persist: () => Promise.resolve(true) },
  });
});
afterEach(async () => {
  vi.restoreAllMocks();
  Reflect.deleteProperty(navigator, 'storage');
  await db.delete();
  for (const d of await indexedDB.databases())
    if (d.name?.startsWith('vlo-item-')) indexedDB.deleteDatabase(d.name);
});

async function writeDoc(id: string) {
  const open = openItemDoc(id);
  await open.ready;
  open.doc.getXmlFragment('default').insert(0, [new Y.XmlText('x')]);
  await open.close();
}

test('addItem puts the new item after its last sibling and touches the project', async () => {
  const { project, firstItemId } = await createProject({ title: 'Debt', template: 'novel' });
  const chapter = (await db.items.get(firstItemId))?.parentId ?? null;
  const scene = await addItem(project.id, chapter, 'scene', 'Scene 2');
  const first = await db.items.get(firstItemId);
  expect(scene.parentId).toBe(chapter);
  expect(first && scene.order > first.order).toBe(true);
  expect(scene.status).toBe('draft');
  expect((await db.projects.get(project.id))?.updatedAt).toBeGreaterThanOrEqual(project.updatedAt);
});

test('nextTitle numbers by kind across the project', async () => {
  const { project } = await createProject({ title: 'Debt', template: 'novel' });
  expect(await nextTitle(project.id, 'scene', 'Scene')).toBe('Scene 2');
  expect(await nextTitle(project.id, 'chapter', 'Chapter')).toBe('Chapter 2');
  expect(await nextTitle(project.id, 'note', 'Note')).toBe('Note 1');
});

test('moveItem changes exactly one item row', async () => {
  const { project, firstItemId } = await createProject({ title: 'Debt', template: 'novel' });
  const spy = vi.spyOn(db.items, 'update');
  await moveItem(firstItemId, null, 'Zz');
  expect(spy).toHaveBeenCalledTimes(1);
  const moved = await db.items.get(firstItemId);
  expect(moved?.parentId).toBeNull();
  expect(moved?.order).toBe('Zz');
  expect((await db.projects.get(project.id))?.updatedAt).toBeGreaterThanOrEqual(project.updatedAt);
});

test('updateItem changes title, synopsis and status', async () => {
  const { firstItemId } = await createProject({ title: 'Salt', template: 'poetry' });
  await updateItem(firstItemId, { title: 'Tide', synopsis: 'Low water.', status: 'revised' });
  const item = await db.items.get(firstItemId);
  expect(item).toMatchObject({ title: 'Tide', synopsis: 'Low water.', status: 'revised' });
});

test('updateItem refuses an empty title', async () => {
  const { firstItemId } = await createProject({ title: 'Salt', template: 'poetry' });
  await expect(updateItem(firstItemId, { title: '  ' })).rejects.toThrow('title');
});

test('deleteItem removes the item, its descendants, their rows and their text databases', async () => {
  const { project, firstItemId: scene } = await createProject({ title: 'Debt', template: 'novel' });
  const chapter = (await db.items.get(scene))?.parentId ?? '';
  const keep = await addItem(project.id, null, 'note', 'Note 1');
  for (const id of [scene, keep.id]) {
    await writeDoc(id);
    await db.itemTexts.put({ itemId: id, projectId: project.id, text: 'x', updatedAt: 1 });
    await db.snapshots.add({
      id: `snap-${id}`,
      projectId: project.id,
      itemId: id,
      createdAt: 1,
      state: new Uint8Array(),
      text: 'x',
    });
  }

  await deleteItem(chapter);

  expect(await db.items.get(chapter)).toBeUndefined();
  expect(await db.items.get(scene)).toBeUndefined();
  expect(await db.itemTexts.get(scene)).toBeUndefined();
  expect(await db.snapshots.get(`snap-${scene}`)).toBeUndefined();
  const names = (await indexedDB.databases()).map((d) => d.name);
  expect(names).not.toContain(itemDocName(scene));
  expect(names).toContain(itemDocName(keep.id));
  expect(await db.items.get(keep.id)).toBeDefined();
  expect(await db.snapshots.get(`snap-${keep.id}`)).toBeDefined();
});
