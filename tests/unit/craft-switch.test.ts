import { afterEach, beforeEach, expect, test } from 'vitest';
import { getCraft, setCraftItem, setCraftLabels } from '@/features/craft/craftStore';
import { createProject } from '@/features/library/projects';
import { db } from '@/lib/db';

/* The Craft switch of each poem (spec 8.3, plan Task C7): off by default, kept with the poem. */

beforeEach(async () => {
  await db.open();
  Object.defineProperty(navigator, 'storage', {
    configurable: true,
    value: { persist: () => Promise.resolve(true) },
  });
});
afterEach(async () => {
  setCraftItem(null, false);
  Reflect.deleteProperty(navigator, 'storage');
  await db.delete();
});

test('a poem starts with the labels off, and the switch stays with that poem only', async () => {
  const { project } = await createProject({ title: 'Salt Hours', templates: ['poetry'] });
  const [poem] = await db.items.where('projectId').equals(project.id).toArray();
  if (!poem) throw new Error('The collection has no poem.');
  expect(poem.craft).toBeUndefined();
  setCraftItem(poem.id, poem.craft === true);
  expect(getCraft()).toEqual({ itemId: poem.id, on: false });

  await setCraftLabels(poem.id, true);
  expect(getCraft().on).toBe(true);
  expect((await db.items.get(poem.id))?.craft).toBe(true);

  // Another screen has no open poem, so its switch reads off.
  setCraftItem(null, true);
  expect(getCraft()).toEqual({ itemId: null, on: false });
  await setCraftLabels(poem.id, false);
  expect((await db.items.get(poem.id))?.craft).toBe(false);
});
