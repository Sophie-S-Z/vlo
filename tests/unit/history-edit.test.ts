import * as Y from 'yjs';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { fromLocalInput, HistoryError, toLocalInput } from '@/features/snapshots/entries';
import {
  BEFORE_SYNC,
  deleteSnapshot,
  editSnapshot,
  snapshotsOf,
  takeSnapshot,
  thinnedIds,
  undoDeleteSnapshot,
} from '@/features/snapshots/snapshots';
import { editVersion, keepSnapshotAsVersion, versionsOf } from '@/features/versions/versions';
import { clock } from '@/lib/clock';
import { db, MAX_NOTE, MAX_VERSION_NAME, MAX_VERSIONS, type Item } from '@/lib/db';
import { docFromUpdate, YFRAGMENT } from '@/lib/ydocs';

/* The writer edits the entries of History: names, notes, pins and dates (Manage entries only). */

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const NOW = new Date(2026, 10, 24, 12).getTime();
const item = { id: 'item-1', projectId: 'project-1' };
const realNow = clock.now.bind(clock);
let now = NOW;
let doc: Y.Doc;

function write(text: string) {
  doc = new Y.Doc();
  const paragraph = new Y.XmlElement('paragraph');
  paragraph.insert(0, [new Y.XmlText(text)]);
  doc.getXmlFragment(YFRAGMENT).insert(0, [paragraph]);
}

const snap = (text: string, label?: string) => {
  write(text);
  return takeSnapshot(item, doc, text, label);
};

beforeEach(async () => {
  await db.open();
  now = NOW;
  clock.now = () => now;
  const row: Item = {
    ...item,
    parentId: null,
    kind: 'scene',
    title: 'Scene 1',
    status: 'draft',
    order: 'a0',
    wordCount: 0,
    createdAt: 0,
    updatedAt: 0,
  };
  await db.items.add(row);
});
afterEach(async () => {
  clock.now = realNow;
  doc.destroy();
  await db.delete();
});

describe('a snapshot', () => {
  const edit = { name: '', note: '', at: NOW, pinned: false };

  test('takes a name, a note, a pin and a date, and keeps its true save time', async () => {
    const s = await snap('Salt on the glass.');
    const at = NOW - 3 * DAY;
    await editSnapshot(s.id, { name: '  First   draft ', note: ' Before the edit. ', at, pinned: true });
    expect(await db.snapshots.get(s.id)).toMatchObject({
      label: 'First draft',
      note: 'Before the edit.',
      shownAt: at,
      pinned: true,
      createdAt: s.createdAt,
    });
  });

  test('an empty name, an empty note, no pin and its own save time leave no fields', async () => {
    const s = await snap('Words.', 'Saved by you');
    await editSnapshot(s.id, { name: 'A', note: 'B', at: NOW - DAY, pinned: true });
    await editSnapshot(s.id, edit);
    const row = await db.snapshots.get(s.id);
    for (const key of ['label', 'note', 'shownAt', 'pinned']) expect(row).not.toHaveProperty(key);
  });

  test('refuses a long name, a long note, a time in the future and a time that is not a date', async () => {
    const s = await snap('Words.');
    const fails = (change: Partial<typeof edit>) => editSnapshot(s.id, { ...edit, ...change });
    await expect(fails({ name: 'x'.repeat(MAX_VERSION_NAME + 1) })).rejects.toThrow(HistoryError);
    await expect(fails({ note: 'x'.repeat(MAX_NOTE + 1) })).rejects.toThrow(HistoryError);
    await expect(fails({ at: NOW + HOUR })).rejects.toThrow(HistoryError);
    await expect(fails({ at: Number.NaN })).rejects.toThrow(HistoryError);
    await expect(editSnapshot('gone', edit)).rejects.toThrow(HistoryError);
  });

  test('History sorts by the date that the writer gives', async () => {
    const older = await snap('one');
    now += HOUR;
    const newer = await snap('two');
    now += 2 * HOUR;
    await editSnapshot(older.id, { ...edit, at: NOW + 2 * HOUR - 1 });
    expect((await snapshotsOf(item.id)).map((s) => s.id)).toEqual([older.id, newer.id]);
  });

  test('a pinned automatic snapshot never thins, and thinning uses the true save time', () => {
    const rows = [
      { id: 'a', createdAt: NOW - 3 * DAY, pinned: true as const },
      { id: 'b', createdAt: NOW - 3 * DAY + HOUR, label: BEFORE_SYNC },
      // A date in the last day does not save a snapshot that is three days old.
      { id: 'c', createdAt: NOW - 3 * DAY + 2 * HOUR, shownAt: NOW - HOUR },
    ];
    expect(thinnedIds(rows, NOW)).toEqual(['b']);
  });

  test('a delete gives the row back, and Undo puts it back as it was', async () => {
    const s = await snap('Words.');
    await editSnapshot(s.id, { ...edit, note: 'Keep me.' });
    const row = await deleteSnapshot(s.id);
    expect(await db.snapshots.count()).toBe(0);
    if (!row) throw new Error('The delete gave no row.');
    await undoDeleteSnapshot(row);
    expect(await db.snapshots.get(s.id)).toEqual(row);
  });
});

describe('keep as a version', () => {
  test('makes a named version with the text and the state of the snapshot', async () => {
    const s = await snap('The tide goes out.');
    write('The text now.');
    const name = await keepSnapshotAsVersion(item, s.id, ' Low tide ');
    expect(name).toBe('Low tide');
    const [version] = await versionsOf(item.id);
    expect(version).toMatchObject({ name: 'Low tide', text: 'The tide goes out.', itemId: item.id });
    const copy = docFromUpdate(version?.state ?? new Uint8Array());
    expect(copy.getXmlFragment(YFRAGMENT).toJSON()).toContain('The tide goes out.');
    copy.destroy();
  });

  test('obeys the rules of a version: a unique name and a limit', async () => {
    const s = await snap('Words.');
    await keepSnapshotAsVersion(item, s.id, 'One');
    await expect(keepSnapshotAsVersion(item, s.id, 'one')).rejects.toThrow('a version named');
    for (let i = 1; i < MAX_VERSIONS; i += 1) await keepSnapshotAsVersion(item, s.id, `V${String(i)}`);
    await expect(keepSnapshotAsVersion(item, s.id, 'Too many')).rejects.toThrow('Delete one first');
  });
});

describe('a version', () => {
  test('takes a note and a date, and History sorts by the date', async () => {
    const s = await snap('Words.');
    await keepSnapshotAsVersion(item, s.id, 'First');
    now += HOUR;
    await keepSnapshotAsVersion(item, s.id, 'Second');
    const [first] = await versionsOf(item.id);
    now += 2 * HOUR;
    await editVersion(item.id, first?.id ?? '', {
      name: 'First',
      note: 'The sad ending.',
      at: NOW + 2 * HOUR,
    });
    const rows = await versionsOf(item.id);
    expect(rows.map((v) => v.name)).toEqual(['Second', 'First']);
    expect(rows[1]).toMatchObject({ note: 'The sad ending.', shownAt: NOW + 2 * HOUR });
    const late = { name: 'First', note: '', at: now + HOUR };
    await expect(editVersion(item.id, first?.id ?? '', late)).rejects.toThrow(HistoryError);
  });
});

describe('the date field', () => {
  test('shows the local time to the second, and an unchanged field gives the exact time back', () => {
    const entry = { createdAt: NOW + 123, shownAt: NOW - DAY + 456 };
    expect(toLocalInput(NOW)).toBe('2026-11-24T12:00:00');
    expect(fromLocalInput(toLocalInput(entry.shownAt), entry)).toBe(entry.shownAt);
    // The true save time comes back exactly, so the date of the writer goes away.
    expect(fromLocalInput(toLocalInput(entry.createdAt), entry)).toBe(entry.createdAt);
    expect(fromLocalInput('2026-11-20T08:30', entry)).toBe(new Date(2026, 10, 20, 8, 30).getTime());
    expect(fromLocalInput('', entry)).toBeNaN();
  });
});
