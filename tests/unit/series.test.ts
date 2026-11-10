import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { styleNotes, styleReason } from '@/features/analysis/style';
import { backUpProject, importBackup, readBackup } from '@/features/backup/backup';
import { addEntry, codexFor, codexMatcher } from '@/features/codex/codex';
import { getCodex, setStyleSheetRules } from '@/features/codex/codexStore';
import { createProject, deleteProject } from '@/features/library/projects';
import {
  addToSeries,
  leaveSeries,
  makeSeries,
  moveBook,
  seriesOf,
  setStyleSheet,
  shareEntry,
  styleRule,
} from '@/features/series/series';
import { db } from '@/lib/db';

/* Plan Task K8 (roadmap F59): a series shares Codex entries and a style sheet. Sync is in sync-engine.test.ts. */

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

async function twoBooks() {
  const one = await createProject({ title: 'Salt', templates: ['novel'] });
  const two = await createProject({ title: 'Tide', templates: ['novel'] });
  const series = await makeSeries(' Tides ', [one.project.id, two.project.id, one.project.id]);
  return { one, two, series };
}

/** The names of a book's Codex, in name order: the entries of two scopes can share an order. */
const names = async (projectId: string) => (await codexFor(projectId)).map((e) => e.name).sort();

describe('series', () => {
  test('a shared entry shows in each book, and its names mark in the text of each book', async () => {
    const { one, two, series } = await twoBooks();
    expect(series).toMatchObject({ title: 'Tides', projectIds: [one.project.id, two.project.id] });
    const mira = await addEntry(one.project.id, 'character', 'Mira');
    await addEntry(two.project.id, 'place', 'Harbour');
    expect(await names(two.project.id)).toEqual(['Harbour']);

    await shareEntry(mira.id, one.project.id, true);
    expect((await db.codex.get(mira.id))?.projectId).toBe(series.id);
    expect(await names(one.project.id)).toEqual(['Mira']);
    expect(await names(two.project.id)).toEqual(['Harbour', 'Mira']);
    const match = codexMatcher(await codexFor(two.project.id));
    expect(match('Mira came to the Harbour.').map((m) => m.entryId)).toHaveLength(2);

    // Off gives the entry to the book that turns it off.
    await shareEntry(mira.id, two.project.id, false);
    expect(await names(one.project.id)).toEqual([]);
    expect(await names(two.project.id)).toEqual(['Harbour', 'Mira']);
  });

  test('a book is in one series, and the order of the books changes', async () => {
    const { one, two, series } = await twoBooks();
    await expect(makeSeries('Other', [one.project.id])).rejects.toThrow(
      'Each of these books is in a series now.',
    );
    await expect(addToSeries(series.id, two.project.id)).rejects.toThrow(RangeError);
    const three = await createProject({ title: 'Wake', templates: ['novel'] });
    await addToSeries(series.id, three.project.id);
    await moveBook(series.id, 2, 0);
    expect((await db.series.get(series.id))?.projectIds).toEqual([
      three.project.id,
      one.project.id,
      two.project.id,
    ]);
  });

  test('a book that leaves keeps a copy of each shared entry that its text uses', async () => {
    const { one, two, series } = await twoBooks();
    const mira = await addEntry(one.project.id, 'character', 'Mira');
    const hale = await addEntry(one.project.id, 'character', 'Hale');
    await shareEntry(mira.id, one.project.id, true);
    await shareEntry(hale.id, one.project.id, true);
    await db.itemTexts.put({
      itemId: two.firstItemId,
      projectId: two.project.id,
      text: 'Mira waits.',
      updatedAt: 1,
    });

    await leaveSeries(two.project.id);
    expect(await seriesOf(two.project.id)).toBeUndefined();
    const kept = await codexFor(two.project.id);
    expect(kept).toMatchObject([{ name: 'Mira', projectId: two.project.id }]);
    expect(kept[0]?.id).not.toBe(mira.id);
    expect(await names(one.project.id)).toEqual(['Hale', 'Mira']);

    // The last book takes its copies, and the series and its entries go.
    await db.itemTexts.put({
      itemId: one.firstItemId,
      projectId: one.project.id,
      text: 'Hale.',
      updatedAt: 1,
    });
    await leaveSeries(one.project.id);
    expect(await db.series.get(series.id)).toBeUndefined();
    expect(await db.codex.where('projectId').equals(series.id).count()).toBe(0);
    expect(await names(one.project.id)).toEqual(['Hale']);
  });

  test('a deleted book leaves its series', async () => {
    const { one, two, series } = await twoBooks();
    await deleteProject(one.project.id);
    expect((await db.series.get(series.id))?.projectIds).toEqual([two.project.id]);
    await deleteProject(two.project.id);
    expect(await db.series.get(series.id)).toBeUndefined();
  });

  test('the style sheet marks an avoided form in any case and names the form to use', async () => {
    const rule = styleRule(' grey ', 'gray, Grey, , gray', 'British spelling');
    expect(rule).toEqual({ use: 'grey', avoid: ['gray'], note: 'British spelling' });
    expect(() => styleRule('grey', 'GREY')).toThrow('Type at least one form to avoid.');
    expect(() => styleRule(' ', 'gray')).toThrow('Type the form to use.');

    const { series } = await twoBooks();
    await setStyleSheet(series.id, [rule]);
    setStyleSheetRules((await db.series.get(series.id))?.styleSheet ?? []);
    const text = 'The Gray sea, grayer still, went gray.';
    const notes = styleNotes(text, 'prose', getCodex().sheet).filter((n) => n.kind === 'sheet');
    expect(notes.map((n) => text.slice(n.from, n.to))).toEqual(['Gray', 'gray']);
    expect(notes[0]?.use).toBe('grey');
    expect(styleReason('sheet', 'Gray', 'grey')).toBe('The series style sheet uses "grey" for "Gray".');
    await expect(
      setStyleSheet(
        series.id,
        Array.from({ length: 201 }, () => rule),
      ),
    ).rejects.toThrow(RangeError);
  });

  test('a backup of one book holds the series, and its import into a fresh browser makes the series again', async () => {
    const { one, two, series } = await twoBooks();
    const mira = await addEntry(one.project.id, 'character', 'Mira');
    await shareEntry(mira.id, one.project.id, true);
    await setStyleSheet(series.id, [styleRule('grey', 'gray')]);
    const { bytes } = await backUpProject(two.project.id, { music: false });
    const backup = await readBackup(bytes);
    expect(backup.series?.row).toMatchObject({ id: series.id, title: 'Tides' });
    expect(backup.series?.codex.map((e) => e.name)).toEqual(['Mira']);

    await db.delete();
    await db.open();
    const id = await importBackup(backup, 'same');
    expect(await seriesOf(id)).toMatchObject({
      id: series.id,
      projectIds: [two.project.id],
      styleSheet: [{ use: 'grey', avoid: ['gray'] }],
    });
    expect(await names(id)).toEqual(['Mira']);

    // A copy is a book of its own: it keeps the shared entries and joins no series.
    const copy = await importBackup(backup, 'copy');
    expect(await seriesOf(copy)).toBeUndefined();
    expect(await names(copy)).toEqual(['Mira']);
  });
});
