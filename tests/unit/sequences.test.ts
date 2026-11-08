import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { addItem, deleteItem } from '@/features/binder/items';
import { buildExportDoc } from '@/features/export/build';
import { createProject } from '@/features/library/projects';
import { frontIndex, ringRadius } from '@/features/sequences/Ring';
import {
  addSequence,
  copySequence,
  deleteSequence,
  moved,
  orderedPoems,
  poemsOf,
  renameSequence,
  restoreSequence,
  setSequenceOrder,
} from '@/features/sequences/sequences';
import { db } from '@/lib/db';
import { item, poemUpdate, project } from './export-fixtures';

/* The Collection Sequencer data (spec 8.3, plan Task C6, US08, Review Focus 4). */

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

/** A collection with four poems: Poem 1 at the top, then a section that holds Poems 2 to 4. */
async function collection() {
  const { project } = await createProject({ title: 'Salt Hours', templates: ['poetry'] });
  const section = await addItem(project.id, null, 'part', 'Tides');
  for (const n of [2, 3, 4]) await addItem(project.id, section.id, 'poem', `Poem ${String(n)}`);
  await addItem(project.id, null, 'note', 'Ideas');
  const items = () => db.items.where('projectId').equals(project.id).toArray();
  return { project, items };
}

const titles = (poems: readonly { title: string }[]) => poems.map((p) => p.title);

describe('poem orders', () => {
  test('moved puts one id in a new place', () => {
    expect(moved(['a', 'b', 'c', 'd'], 0, 2)).toEqual(['b', 'c', 'a', 'd']);
    expect(moved(['a', 'b', 'c', 'd'], 3, 0)).toEqual(['d', 'a', 'b', 'c']);
    expect(moved(['a', 'b'], 1, 9)).toEqual(['a', 'b']);
  });

  test('a new order starts with the poems in binder order, without sections or notes', async () => {
    const { project, items } = await collection();
    const chapbook = await addSequence(project.id, '  Chapbook ');
    expect(chapbook.name).toBe('Chapbook');
    expect(titles(orderedPoems(chapbook, poemsOf(await items())))).toEqual([
      'Poem 1',
      'Poem 2',
      'Poem 3',
      'Poem 4',
    ]);
    await expect(addSequence(project.id, ' ')).rejects.toThrow('Type a name for the order.');
  });

  test('US08: a move in one order never changes another', async () => {
    const { project, items } = await collection();
    const chapbook = await addSequence(project.id, 'Chapbook');
    const contest = await addSequence(project.id, 'Contest');
    await setSequenceOrder(contest.id, moved(contest.itemIds, 3, 0));
    const poems = poemsOf(await items());
    const stored = async (id: string) => {
      const row = await db.sequences.get(id);
      return row ? titles(orderedPoems(row, poems)) : [];
    };
    expect(await stored(contest.id)).toEqual(['Poem 4', 'Poem 1', 'Poem 2', 'Poem 3']);
    expect(await stored(chapbook.id)).toEqual(['Poem 1', 'Poem 2', 'Poem 3', 'Poem 4']);
  });

  test('a new poem joins the end of each order, and a deleted poem leaves no gap', async () => {
    const { project, items } = await collection();
    const contest = await addSequence(project.id, 'Contest');
    await setSequenceOrder(contest.id, moved(contest.itemIds, 0, 3));
    const fifth = await addItem(project.id, null, 'poem', 'Poem 5');
    const second = poemsOf(await items()).find((p) => p.title === 'Poem 2');
    if (!second) throw new Error('No Poem 2.');
    await deleteItem(second.id);
    const row = await db.sequences.get(contest.id);
    if (!row) throw new Error('No order.');
    expect(row.itemIds).not.toContain(second.id);
    expect(titles(orderedPoems(row, poemsOf(await items())))).toEqual([
      'Poem 3',
      'Poem 4',
      'Poem 1',
      'Poem 5',
    ]);
    expect(orderedPoems(row, poemsOf(await items())).at(-1)?.id).toBe(fifth.id);
  });

  test('copy, rename, and delete with undo', async () => {
    const { project, items } = await collection();
    const chapbook = await addSequence(project.id, 'Chapbook');
    await setSequenceOrder(chapbook.id, moved(chapbook.itemIds, 2, 0));
    const copy = await copySequence(chapbook.id, 'Chapbook copy');
    if (!copy) throw new Error('No copy.');
    expect(copy.id).not.toBe(chapbook.id);
    const poems = poemsOf(await items());
    expect(titles(orderedPoems(copy, poems))).toEqual(['Poem 3', 'Poem 1', 'Poem 2', 'Poem 4']);
    await renameSequence(copy.id, 'Contest');
    expect((await db.sequences.get(copy.id))?.name).toBe('Contest');
    const deleted = await deleteSequence(copy.id);
    expect(await db.sequences.get(copy.id)).toBeUndefined();
    if (!deleted) throw new Error('No deleted order.');
    await restoreSequence(deleted);
    expect((await db.sequences.get(copy.id))?.name).toBe('Contest');
    expect(await db.items.where('projectId').equals(project.id).count()).toBe(6);
  });
});

describe('the ring preview', () => {
  test('frontIndex gives the poem nearest the front at any angle, in both directions', () => {
    expect(frontIndex(0, 4)).toBe(0);
    expect(frontIndex(90, 4)).toBe(1);
    expect(frontIndex(130, 4)).toBe(1);
    expect(frontIndex(140, 4)).toBe(2);
    expect(frontIndex(-90, 4)).toBe(3);
    expect(frontIndex(720 + 270, 4)).toBe(3);
    expect(frontIndex(45, 0)).toBe(0);
  });

  test('ringRadius gives room for each card, within limits', () => {
    expect(ringRadius(1)).toBe(150);
    expect(ringRadius(12)).toBe(Math.round((12 * 168) / (2 * Math.PI)));
    expect(ringRadius(500)).toBe(620);
  });
});

describe('export of one order (E2)', () => {
  test('the export holds the poems of the order in its sequence, with the order name in the title', () => {
    const poems = [item('p1', 'poem', 'Low Tide'), item('p2', 'poem', 'Salt'), item('p3', 'poem', 'Gulls')];
    const doc = buildExportDoc({
      project: project('poetry'),
      items: poems,
      scope: { kind: 'sequence', name: 'Chapbook', itemIds: ['p3', 'p1'] },
      updates: new Map(poems.map((p) => [p.id, poemUpdate('A line\n')])),
    });
    expect(doc.title).toContain(', Chapbook');
    expect(doc.sections.map((s) => s.title)).toEqual(['Gulls', 'Low Tide']);
  });
});
