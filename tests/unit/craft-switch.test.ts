import { afterEach, beforeEach, expect, test } from 'vitest';
import { craftOf, setCraftLabels, setCraftPoem } from '@/features/craft/craftStore';
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
  Reflect.deleteProperty(navigator, 'storage');
  await db.delete();
});

test('a poem starts with the labels off, and the switch stays with that poem only', async () => {
  const { project } = await createProject({ title: 'Salt Hours', templates: ['poetry'] });
  const [poem] = await db.items.where('projectId').equals(project.id).toArray();
  if (!poem) throw new Error('The collection has no poem.');
  expect(poem.craft).toBeUndefined();
  setCraftPoem(poem.id, poem.craft === true);
  // A second poem is open beside the first (F39).
  setCraftPoem('beside', false);
  expect(craftOf(poem.id)).toBe(false);

  await setCraftLabels(poem.id, true);
  expect(craftOf(poem.id)).toBe(true);
  expect(craftOf('beside')).toBe(false);
  expect((await db.items.get(poem.id))?.craft).toBe(true);

  // A closed poem has no switch here, and its stored switch still changes.
  setCraftPoem(poem.id, null);
  setCraftPoem('beside', null);
  expect(craftOf(poem.id)).toBeUndefined();
  await setCraftLabels(poem.id, false);
  expect(craftOf(poem.id)).toBeUndefined();
  expect((await db.items.get(poem.id))?.craft).toBe(false);
});
