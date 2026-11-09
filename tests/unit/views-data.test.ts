import JSZip from 'jszip';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { backUpProject, importBackup, readBackup } from '@/features/backup/backup';
import { addItem, deleteItem } from '@/features/binder/items';
import { createProject, deleteProject } from '@/features/library/projects';
import { db, readViewRows, type Item, type ViewRows } from '@/lib/db';
import { updateToJson } from '@/features/export/read';
import { markAllInProject } from '@/features/people/markAll';
import { addPerson } from '@/features/people/people';
import { readItemUpdate, writeItemUpdate } from '@/lib/ydocs';
import { proseUpdate } from './export-fixtures';

/* The template view rows (plan Task C1): delete rules, and the rows in a backup file (version 2). */

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

/** A novel with a row in each view table. Each reference points to a row of the project. */
async function novelWithViews() {
  const { project } = await createProject({ title: 'Salt Year', templates: ['novel'] });
  const first = (await db.items.where('projectId').equals(project.id).toArray()).find(
    (i) => i.kind === 'scene',
  );
  if (!first) throw new Error('The novel has no scene.');
  const second = await addItem(project.id, first.parentId, 'scene', 'Scene 2');
  const scenes = [first, second];
  for (const scene of scenes) await writeItemUpdate(scene.id, proseUpdate(['The gulls slept.']), 1);
  const p = project.id;
  await db.lifeStages.add({
    id: `stage-${p}`,
    projectId: p,
    name: 'Childhood',
    start: '1988',
    end: '1999',
    color: 'sage',
    order: 'a0',
  });
  await db.items.update(first.id, {
    memory: { date: '1994-07', lifeStageId: `stage-${p}`, themes: ['sea'] },
  });
  await db.threads.add({ id: `thread-${p}`, projectId: p, name: "Mira's debt", color: 'rose', order: 'a0' });
  await db.cards.bulkAdd([
    { id: `card-a-${p}`, projectId: p, itemId: first.id, title: 'Storm', x: -40, y: 16, color: 'amber' },
    {
      id: `card-b-${p}`,
      projectId: p,
      itemId: second.id,
      title: 'Debt',
      note: 'Mira pays.',
      x: 320,
      y: 16,
      color: 'sky',
    },
  ]);
  await db.cardLinks.add({
    id: `link-${p}`,
    projectId: p,
    fromCardId: `card-a-${p}`,
    toCardId: `card-b-${p}`,
    threadId: `thread-${p}`,
  });
  await db.sequences.add({
    id: `seq-${p}`,
    projectId: p,
    name: 'Chapbook',
    itemIds: [second.id, first.id],
    createdAt: 3,
  });
  await db.people.add({
    id: `person-${p}`,
    projectId: p,
    label: 'Aunt Rosa',
    variants: [
      { real: 'Aunt Rosa', alias: 'Aunt Maria' },
      { real: 'Rosa', alias: 'Maria' },
    ],
  });
  await db.submissions.add({
    id: `sub-${p}`,
    projectId: p,
    itemIds: [first.id],
    venue: 'Harbour Review',
    sentAt: '2026-10-01',
    status: 'sent',
  });
  await db.codex.add({
    id: `codex-${p}`,
    projectId: p,
    kind: 'character',
    name: 'Mira',
    aliases: ['Mi'],
    note: 'Owes the harbour master.',
    order: 'a0',
  });
  return { project, first, second };
}

async function views(projectId: string): Promise<ViewRows> {
  return db.transaction('r', db.tables, () => readViewRows(projectId));
}

const total = (rows: ViewRows) =>
  (Object.values(rows) as unknown[][]).reduce((sum, list) => sum + list.length, 0);

describe('Template view rows', () => {
  test('deleting a project removes its view rows and keeps the rows of other projects', async () => {
    const { project } = await novelWithViews();
    const other = await novelWithViews();
    expect(total(await views(project.id))).toBe(9);
    await deleteProject(project.id);
    expect(total(await views(project.id))).toBe(0);
    expect(total(await views(other.project.id))).toBe(9);
  });

  test('deleting an item unlinks its card, drops it from each poem order, and keeps it in a submission', async () => {
    const { project, first, second } = await novelWithViews();
    await deleteItem(first.id);
    const rows = await views(project.id);
    const card = rows.cards.find((c) => c.title === 'Storm');
    expect(card).toBeDefined();
    expect(card?.itemId).toBeUndefined();
    expect(rows.cards.find((c) => c.title === 'Debt')?.itemId).toBe(second.id);
    expect(rows.sequences[0]?.itemIds).toEqual([second.id]);
    expect(rows.submissions[0]?.itemIds).toEqual([first.id]);
  });
});

describe('View rows in a backup', () => {
  test('a backup imported after a delete gives identical view rows', async () => {
    const { project } = await novelWithViews();
    const before = await views(project.id);
    const { bytes } = await backUpProject(project.id, { music: false });
    await deleteProject(project.id);
    await importBackup(await readBackup(bytes), 'same');
    expect(await views(project.id)).toEqual(before);
  });

  test('a copy gives every view row a new id and points each reference into the copy', async () => {
    const { project } = await novelWithViews();
    const { bytes } = await backUpProject(project.id, { music: false });
    const copyId = await importBackup(await readBackup(bytes), 'copy');
    const copy = await views(copyId);
    const original = await views(project.id);
    expect(total(copy)).toBe(total(original));
    const items = await db.items.where('projectId').equals(copyId).toArray();
    const itemIds = new Set(items.map((i) => i.id));
    const cardIds = new Set(copy.cards.map((c) => c.id));
    for (const name of Object.keys(copy) as (keyof ViewRows)[])
      for (const row of copy[name]) {
        expect(row.projectId).toBe(copyId);
        expect(original[name].some((o) => o.id === row.id)).toBe(false);
      }
    expect(copy.cards.every((c) => c.itemId !== undefined && itemIds.has(c.itemId))).toBe(true);
    expect(copy.cardLinks[0] && cardIds.has(copy.cardLinks[0].fromCardId)).toBe(true);
    expect(copy.cardLinks[0] && cardIds.has(copy.cardLinks[0].toCardId)).toBe(true);
    expect(copy.cardLinks[0]?.threadId).toBe(copy.threads[0]?.id);
    expect(copy.sequences[0]?.itemIds.every((id) => itemIds.has(id))).toBe(true);
    expect(copy.submissions[0]?.itemIds.every((id) => itemIds.has(id))).toBe(true);
    const memory = items.find((i: Item) => i.memory !== undefined)?.memory;
    expect(memory?.lifeStageId).toBe(copy.lifeStages[0]?.id);
    expect(memory?.themes).toEqual(['sea']);
  });

  test('a copy points each private-name mark in the text and the snapshots to the new person', async () => {
    const { project } = await createProject({ title: 'Salt Kitchen', templates: ['memoir'] });
    const memory = (await db.items.where('projectId').equals(project.id).toArray()).find(
      (i) => i.kind === 'memory',
    );
    if (!memory) throw new Error('The memoir has no memory.');
    await writeItemUpdate(memory.id, proseUpdate(['Rosa came home.']), 1);
    const person = await addPerson(project.id, '', [{ real: 'Rosa', alias: 'Maria' }]);
    await markAllInProject(project.id, [person]);
    await db.snapshots.add({
      id: 'snap-1',
      projectId: project.id,
      itemId: memory.id,
      createdAt: 2,
      state: await readItemUpdate(memory.id),
      text: 'Rosa came home.',
    });
    const { bytes } = await backUpProject(project.id, { music: false });
    const copyId = await importBackup(await readBackup(bytes), 'copy');
    const copyPerson = (await db.people.where('projectId').equals(copyId).toArray())[0];
    const copyMemory = (await db.items.where('projectId').equals(copyId).toArray()).find(
      (i) => i.kind === 'memory',
    );
    if (!copyPerson || !copyMemory) throw new Error('The copy has no person or memory.');
    expect(copyPerson.id).not.toBe(person.id);
    const personOf = (update: Uint8Array) =>
      /"personId":"([^"]+)"/.exec(JSON.stringify(updateToJson(update)))?.[1];
    expect(personOf(await readItemUpdate(copyMemory.id))).toBe(copyPerson.id);
    const snapshot = (await db.snapshots.where('itemId').equals(copyMemory.id).toArray())[0];
    expect(snapshot && personOf(snapshot.state)).toBe(copyPerson.id);
    expect(personOf(await readItemUpdate(memory.id))).toBe(person.id);
  });

  test('a version 1 backup, which has no view rows, still imports', async () => {
    const { project } = await createProject({ title: 'Old file', templates: ['novel'] });
    const zip = await JSZip.loadAsync((await backUpProject(project.id, { music: false })).bytes);
    const manifest = JSON.parse((await zip.file('project.json')?.async('string')) ?? '{}') as Record<
      string,
      unknown
    >;
    manifest.version = 1;
    for (const key of ['cards', 'threads', 'cardLinks', 'lifeStages', 'sequences', 'people', 'submissions'])
      Reflect.deleteProperty(manifest, key);
    zip.file('project.json', JSON.stringify(manifest));
    await deleteProject(project.id);
    const backup = await readBackup(await zip.generateAsync({ type: 'uint8array' }));
    expect(total(backup.views)).toBe(0);
    expect(await importBackup(backup, 'same')).toBe(project.id);
    expect(await db.projects.get(project.id)).toBeDefined();
  });

  test('refuses view rows that point outside the file', async () => {
    const { project } = await novelWithViews();
    const bytes = (await backUpProject(project.id, { music: false })).bytes;
    type Rows = Record<string, Record<string, unknown>[]>;
    /** Sets one field of the first row of a list. */
    const set =
      (key: string, field: string, value: unknown) =>
      (m: Rows): void => {
        const first = m[key]?.[0];
        if (!first) throw new Error(`The manifest has no ${key}.`);
        first[field] = value;
      };
    const cases: [(m: Rows) => void, RegExp][] = [
      [set('cardLinks', 'toCardId', 'gone'), /A card link has no card/],
      [set('cardLinks', 'threadId', 'gone'), /A card link has no thread/],
      [set('cards', 'itemId', 'gone'), /links to an item that is not in it/],
      [set('cards', 'x', 'left'), /has a wrong x/],
      [set('sequences', 'itemIds', ['gone']), /holds a poem that is not in it/],
      [set('submissions', 'status', 'lost'), /has a wrong status/],
      [set('people', 'variants', [{ real: 'Rosa' }]), /A person has wrong names/],
      [
        (m) => {
          m.lifeStages = [];
        },
        /names a life stage that is not in it/,
      ],
      [set('threads', 'projectId', 'other'), /belongs to another project/],
    ];
    for (const [change, message] of cases) {
      const zip = await JSZip.loadAsync(bytes);
      const manifest = JSON.parse((await zip.file('project.json')?.async('string')) ?? '{}') as Rows;
      change(manifest);
      zip.file('project.json', JSON.stringify(manifest));
      await expect(readBackup(await zip.generateAsync({ type: 'uint8array' }))).rejects.toThrow(message);
    }
  });
});
