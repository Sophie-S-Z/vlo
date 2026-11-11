import JSZip from 'jszip';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { backUpProject, importBackup, readBackup } from '@/features/backup/backup';
import { addItem } from '@/features/binder/items';
import {
  addEntry,
  changesAt,
  codexAt,
  deleteChange,
  entryAt,
  readingOrder,
  saveChange,
} from '@/features/codex/codex';
import { codexContext } from '@/features/ai/reader';
import { createProject } from '@/features/library/projects';
import { makeSeries, shareEntry } from '@/features/series/series';
import { db, type CodexEntry } from '@/lib/db';

/* Roadmap 2 F65, plan Tasks N1 and N2, Review Focus 1 and 2: Codex changes at a scene. */

const places = new Map([
  ['s1', 0],
  ['s2', 1],
  ['s3', 2],
]);
const mira: CodexEntry = {
  id: 'm',
  projectId: 'p',
  kind: 'character',
  name: 'Mira',
  aliases: [],
  note: 'Ferry pilot',
  order: 'a0',
  changes: [
    { id: 'c2', itemId: 's3', text: 'Leaves the island.', leaves: true },
    { id: 'c1', itemId: 's2', text: 'Loses her left eye' },
    { id: 'c0', itemId: 'gone', text: 'Owes money.' },
  ],
};

describe('the entry at a scene', () => {
  test('a change holds at its scene and after it, in reading order, and not before it', () => {
    expect(changesAt(mira, places, 's1')).toEqual([]);
    expect(changesAt(mira, places, 's2').map((c) => c.id)).toEqual(['c1']);
    expect(changesAt(mira, places, 's3').map((c) => c.id)).toEqual(['c1', 'c2']);
    expect(entryAt(mira, places, 's1')).toBe(mira);
    expect(entryAt(mira, places, 's3').note).toBe('Ferry pilot. Loses her left eye. Leaves the island.');
  });

  test('a change of a deleted scene, and an item with no place, hold nowhere', () => {
    expect(changesAt(mira, places, 'other')).toEqual([]);
    expect(changesAt(mira, places, 's3').some((c) => c.id === 'c0')).toBe(false);
  });

  test('the reader panel notes hold the entry at the scene and no later change', () => {
    const at = (itemId: string) => codexContext([entryAt(mira, places, itemId)], 'Mira waits.');
    expect(at('s2')).toBe('- Mira (character): Ferry pilot. Loses her left eye.');
    expect(at('s1')).toBe('- Mira (character): Ferry pilot');
  });
});

describe('changes in the database', () => {
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

  async function book(title: string) {
    const { project } = await createProject({ title, templates: ['novel'] });
    const first = await addItem(project.id, null, 'scene', 'Harbour');
    const second = await addItem(project.id, null, 'scene', 'Lighthouse');
    return { project, first, second };
  }

  test('a change saves, edits, deletes and comes back, and a blank change is refused', async () => {
    const { project, second } = await book('Salt Year');
    const entry = await addEntry(project.id, 'character', 'Mira');
    const change = await saveChange(entry.id, { itemId: second.id, text: ' Loses an eye. ', leaves: false });
    expect((await db.codex.get(entry.id))?.changes).toEqual([change]);
    await saveChange(entry.id, { ...change, text: 'Loses her left eye.', leaves: true });
    expect((await db.codex.get(entry.id))?.changes).toEqual([
      { id: change.id, itemId: second.id, text: 'Loses her left eye.', leaves: true },
    ]);
    await expect(saveChange(entry.id, { itemId: second.id, text: ' ', leaves: false })).rejects.toThrow(
      'Type the change.',
    );
    const gone = await deleteChange(entry.id, change.id);
    expect((await db.codex.get(entry.id))?.changes).toBeUndefined();
    if (gone) await saveChange(entry.id, { ...gone, leaves: gone.leaves === true });
    expect((await db.codex.get(entry.id))?.changes).toHaveLength(1);
  });

  test('in a series, a change in book 1 holds in book 2, and a change in book 2 does not hold in book 1', async () => {
    const one = await book('Book One');
    const two = await book('Book Two');
    await makeSeries('Tides', [one.project.id, two.project.id]);
    const entry = await addEntry(one.project.id, 'character', 'Mira');
    await shareEntry(entry.id, one.project.id, true);
    await saveChange(entry.id, { itemId: one.second.id, text: 'Loses her left eye.', leaves: false });
    await saveChange(entry.id, { itemId: two.second.id, text: 'Leaves the island.', leaves: true });

    const order = await readingOrder(two.project.id);
    // A new book also has its first chapter and scene, before the scenes that the test adds.
    const added = order.filter((r) => r.item.title === 'Harbour' || r.item.title === 'Lighthouse');
    expect(added.map((r) => `${r.book}: ${r.item.title}`)).toEqual([
      'Book One: Harbour',
      'Book One: Lighthouse',
      'Book Two: Harbour',
      'Book Two: Lighthouse',
    ]);
    const note = async (projectId: string, itemId: string) =>
      (await codexAt(projectId, itemId)).find((e) => e.id === entry.id)?.note;
    expect(await note(one.project.id, one.first.id)).toBeUndefined();
    expect(await note(two.project.id, two.first.id)).toBe('Loses her left eye.');
    expect(await note(one.project.id, one.second.id)).toBe('Loses her left eye.');
    expect(await note(two.project.id, two.second.id)).toBe('Loses her left eye. Leaves the island.');
  });

  test('changes survive a backup, a copy gets the new scene ids, and a damaged change is refused', async () => {
    const { project, second } = await book('Salt Year');
    const entry = await addEntry(project.id, 'character', 'Mira');
    await saveChange(entry.id, { itemId: second.id, text: 'Loses her left eye.', leaves: true });
    await saveChange(entry.id, { itemId: 'a-scene-of-another-book', text: 'Owes money.', leaves: false });
    const { bytes } = await backUpProject(project.id, { music: false });

    await importBackup(await readBackup(bytes), 'replace');
    expect((await db.codex.get(entry.id))?.changes).toHaveLength(2);

    const copyId = await importBackup(await readBackup(bytes), 'copy');
    const [copied] = await db.codex.where('projectId').equals(copyId).toArray();
    const lighthouse = (await db.items.where('projectId').equals(copyId).toArray()).find(
      (item) => item.title === 'Lighthouse',
    );
    // The scene of another book is not in the copy, so its change stays out.
    expect(copied?.changes).toEqual([
      expect.objectContaining({ itemId: lighthouse?.id, text: 'Loses her left eye.', leaves: true }),
    ]);

    const zip = await JSZip.loadAsync(bytes);
    const manifest = JSON.parse((await zip.file('project.json')?.async('string')) ?? '{}') as {
      codex: { changes: unknown[] }[];
    };
    const [row] = manifest.codex;
    if (row) row.changes = [{ id: 'c', itemId: second.id, text: 'Lost.', leaves: 'yes' }];
    zip.file('project.json', JSON.stringify(manifest));
    await expect(readBackup(await zip.generateAsync({ type: 'uint8array' }))).rejects.toThrow(
      'A Codex change has a wrong leaves.',
    );
  });
});
