import * as Y from 'yjs';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { createProject, deleteProject, renameProject } from '@/features/library/projects';
import { db } from '@/lib/db';
import { itemDocName } from '@/lib/itemDocName';
import { openItemDoc } from '@/lib/ydocs';
import { sortByOrder } from '@/lib/order';

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
  for (const d of await indexedDB.databases())
    if (d.name?.startsWith('vlo-item-')) indexedDB.deleteDatabase(d.name);
});

describe('createProject', () => {
  test('a new project starts in Pen mode with the spec defaults', async () => {
    const { project } = await createProject({ title: 'Salt', template: 'poetry' });
    expect(project.aiMode).toBe('pen');
    expect(project.settings).toEqual({
      snapshotEveryMinutes: 10,
      aliasAiRequests: false,
      streaksEnabled: false,
      restDays: [],
    });
    expect((await db.projects.get(project.id))?.title).toBe('Salt');
  });

  test('memoir projects alias AI requests by default', async () => {
    const { project } = await createProject({ title: 'Coast', template: 'memoir' });
    expect(project.settings.aliasAiRequests).toBe(true);
  });

  test('the starter items exist in order, and the first writable item is returned', async () => {
    const { project, firstItemId } = await createProject({ title: 'Debt', template: 'novel' });
    const items = await db.items.where('projectId').equals(project.id).toArray();
    const roots = sortByOrder(items.filter((i) => i.parentId === null));
    expect(roots.map((i) => i.kind)).toEqual(['chapter']);
    const scene = items.find((i) => i.id === firstItemId);
    expect(scene?.kind).toBe('scene');
    expect(scene?.parentId).toBe(roots[0]?.id);
    expect(scene?.status).toBe('draft');
  });

  test('the first project asks the browser for persistent storage and records the answer', async () => {
    await createProject({ title: 'One', template: 'poetry' });
    expect((await db.appMeta.get('persistence'))?.value).toBe('granted');
  });
});

describe('renameProject', () => {
  test('changes the title and the updated time', async () => {
    const { project } = await createProject({ title: 'Old', template: 'poetry' });
    await renameProject(project.id, 'New');
    const back = await db.projects.get(project.id);
    expect(back?.title).toBe('New');
    expect(back?.updatedAt).toBeGreaterThanOrEqual(project.updatedAt);
  });

  test('refuses an empty title', async () => {
    const { project } = await createProject({ title: 'Keep', template: 'poetry' });
    await expect(renameProject(project.id, '   ')).rejects.toThrow('title');
  });
});

describe('deleteProject', () => {
  test('removes every row and item database of that project only', async () => {
    const keep = await createProject({ title: 'Keep', template: 'poetry' });
    const gone = await createProject({ title: 'Gone', template: 'poetry' });
    for (const id of [keep.firstItemId, gone.firstItemId]) {
      const open = openItemDoc(id);
      await open.ready;
      open.doc.getXmlFragment('default').insert(0, [new Y.XmlText('x')]);
      await open.close();
      await db.itemTexts.put({ itemId: id, projectId: '', text: 'x', updatedAt: 1 });
    }
    await db.itemTexts.update(keep.firstItemId, { projectId: keep.project.id });
    await db.itemTexts.update(gone.firstItemId, { projectId: gone.project.id });
    await db.snapshots.add({
      id: 's',
      projectId: gone.project.id,
      itemId: gone.firstItemId,
      createdAt: 1,
      state: new Uint8Array(),
      text: '',
    });
    await db.sessions.add({
      id: 'w',
      projectId: gone.project.id,
      startedAt: 1,
      endedAt: 2,
      wordsAdded: 0,
      poemsAdded: 0,
    });

    await deleteProject(gone.project.id);

    expect(await db.projects.get(gone.project.id)).toBeUndefined();
    expect(await db.items.where('projectId').equals(gone.project.id).count()).toBe(0);
    expect(await db.snapshots.where('projectId').equals(gone.project.id).count()).toBe(0);
    expect(await db.sessions.where('projectId').equals(gone.project.id).count()).toBe(0);
    expect(await db.itemTexts.where('projectId').equals(gone.project.id).count()).toBe(0);
    const names = (await indexedDB.databases()).map((d) => d.name);
    expect(names).not.toContain(itemDocName(gone.firstItemId));
    expect(names).toContain(itemDocName(keep.firstItemId));
    expect(await db.projects.get(keep.project.id)).toBeDefined();
    expect(await db.itemTexts.get(keep.firstItemId)).toBeDefined();
  });
});
