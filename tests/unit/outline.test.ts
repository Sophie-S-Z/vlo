import { afterEach, beforeEach, expect, test } from 'vitest';
import { collectBackup } from '@/features/backup/backup';
import { readBackup, writeBackup } from '@/features/backup/file';
import { addItem } from '@/features/binder/items';
import { createProject } from '@/features/library/projects';
import { labelOf, orderForMove, outlineRows, saveLabels, setItemLabel } from '@/features/outline/outline';
import { db, MAX_LABELS, type Item, type Label } from '@/lib/db';
import { sortByOrder } from '@/lib/order';

/* The Outline view (roadmap F40, plan Task H1). */

beforeEach(async () => {
  await db.open();
});
afterEach(async () => {
  await db.delete();
});

function item(id: string, parentId: string | null, order: string, wordCount: number): Item {
  return {
    id,
    projectId: 'p',
    parentId,
    kind: parentId === null ? 'chapter' : 'scene',
    title: id,
    status: 'draft',
    order,
    wordCount,
    createdAt: 0,
    updatedAt: 0,
  };
}

const RED: Label = { id: 'red', name: 'Needs research', color: 'rose' };
const BLUE: Label = { id: 'blue', name: 'Flashback', color: 'sky' };

test('rows follow the binder order and depth, and a folder sums its items', () => {
  const rows = outlineRows([
    item('c2', null, 'b', 0),
    item('s2', 'c1', 'b', 30),
    item('c1', null, 'a', 0),
    item('s1', 'c1', 'a', 12),
    item('s3', 'c2', 'a', 5),
  ]);
  expect(rows.map((r) => [r.item.id, r.depth, r.words])).toEqual([
    ['c1', 0, 42],
    ['s1', 1, 12],
    ['s2', 1, 30],
    ['c2', 0, 5],
    ['s3', 1, 5],
  ]);
});

test('an item with an unknown label shows none', () => {
  const tagged = { ...item('s1', 'c1', 'a', 0), labelId: 'gone' };
  expect(labelOf([RED], tagged)).toBeNull();
  expect(labelOf(undefined, tagged)).toBeNull();
  expect(labelOf([RED], { ...tagged, labelId: 'red' })).toBe(RED);
});

test('a card move gives an order key between its new neighbours', () => {
  const siblings = [item('a', 'c', 'a0', 0), item('b', 'c', 'a1', 0), item('c', 'c', 'a2', 0)];
  const order = (from: number, to: number) => {
    const moved = siblings.map((s, i) =>
      i === from ? { ...s, order: orderForMove(siblings, from, to) } : s,
    );
    return sortByOrder(moved).map((s) => s.id);
  };
  expect(order(0, 2)).toEqual(['b', 'c', 'a']);
  expect(order(2, 0)).toEqual(['c', 'a', 'b']);
  expect(order(0, 1)).toEqual(['b', 'a', 'c']);
});

test('a deleted label leaves its items with none, in one save', async () => {
  const { project, firstItemId } = await createProject({ title: 'Debt', templates: ['novel'] });
  await saveLabels(project.id, [RED, BLUE]);
  await setItemLabel(firstItemId, 'red');
  expect((await db.items.get(firstItemId))?.labelId).toBe('red');
  await saveLabels(project.id, [BLUE]);
  expect((await db.items.get(firstItemId))?.labelId).toBeUndefined();
  expect((await db.projects.get(project.id))?.settings.labels).toEqual([BLUE]);
  await setItemLabel(firstItemId, 'blue');
  await setItemLabel(firstItemId, null);
  expect(await db.items.get(firstItemId)).not.toHaveProperty('labelId');
});

test('a backup keeps the labels, and a damaged label list fails', async () => {
  const { project, firstItemId } = await createProject({ title: 'Debt', templates: ['novel'] });
  await saveLabels(project.id, [RED]);
  await setItemLabel(firstItemId, 'red');
  const scene = await addItem(project.id, null, 'note', 'Note 1');
  const backup = await readBackup(await writeBackup(await collectBackup(project.id, { music: false })));
  expect(backup.project.settings.labels).toEqual([RED]);
  expect(backup.items.find((i) => i.id === firstItemId)?.labelId).toBe('red');
  expect(backup.items.find((i) => i.id === scene.id)).not.toHaveProperty('labelId');

  const tooMany = Array.from({ length: MAX_LABELS + 1 }, (_, i) => ({ ...RED, id: `l${String(i)}` }));
  for (const labels of [tooMany, [RED, RED], [{ ...RED, name: ' ' }], [null]]) {
    const bad = await collectBackup(project.id, { music: false });
    (bad.project.settings as { labels: unknown }).labels = labels;
    await expect(readBackup(await writeBackup(bad))).rejects.toThrow('damaged');
  }
});
