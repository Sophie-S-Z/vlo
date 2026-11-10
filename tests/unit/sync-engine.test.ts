import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import * as Y from 'yjs';
import { DOC_SCHEMA } from '@/features/editor/docSchema';
import {
  blobKey,
  MAX_SYNC_FILE,
  openBlob,
  sealBlob,
  syncKeys,
  type RowsBlob,
  type SyncKeys,
  type TextBlob,
} from '@/features/sync/blobs';
import { BEFORE_SYNC, syncOnce } from '@/features/sync/engine';
import type { Version } from '@/features/sync/merge';
import { readSpace, SYNC_META, type SyncSpace } from '@/features/sync/space';
import { clock } from '@/lib/clock';
import { fromBase64, newShareKey, toBase64 } from '@/lib/crypto';
import { db, type Project } from '@/lib/db';
import { itemDocName } from '@/lib/itemDocName';
import { docFromUpdate, encodeDoc, writeItemUpdate, YFRAGMENT } from '@/lib/ydocs';
import { FakeSyncRelay } from '../fixtures/syncRelay';
import { item, project, proseUpdate, updateOf } from './export-fixtures';

/* Plan Task I6 (roadmap F49, decisions R5 and R6, ADR 0008): a sync round on one device, against a fake relay. */

const relay = vi.hoisted(() => ({ fake: null as FakeSyncRelay | null }));
vi.mock('@/features/share/rpc', async (original) => ({
  ...(await original<typeof import('@/features/share/rpc')>()),
  rpc: (name: string, args: Record<string, unknown>) =>
    Promise.resolve().then(() => relay.fake?.call(name, args)),
}));

const OTHER = 'device-other-0000000';
const TOKEN = 'space-token'.padEnd(43, '0');
let now = 1000;
let keys: SyncKeys;
let fake: FakeSyncRelay;
let spaceId: string;

const novel = (id = 'p1'): Project => ({
  ...project('novel'),
  id,
  aiMode: 'pen',
  createdAt: 0,
  updatedAt: 0,
});
const card = (id: string, title: string, projectId = 'p1') => ({
  id,
  projectId,
  title,
  x: 0,
  y: 0,
  color: 'sky',
});
async function space(): Promise<SyncSpace> {
  const record = await readSpace();
  if (!record) throw new Error('No sync record.');
  return record;
}

/** Puts a blob on the relay as the other device does. */
async function fromOther(name: string, blob: RowsBlob | TextBlob) {
  const sealed = await sealBlob(blob, keys);
  fake.call('sync_put', {
    p_space: spaceId,
    p_token: TOKEN,
    p_device: OTHER,
    p_key: await blobKey(keys, name),
    p_payload: sealed.payload,
    p_iv: sealed.iv,
  });
}
const rows = (versions: Version[], projectId = 'p1', schema = DOC_SCHEMA): RowsBlob => ({
  v: 1,
  schema,
  from: 'Phone',
  projectId,
  rows: versions,
});
const text = (itemId: string, doc: Y.Doc): TextBlob => ({
  v: 1,
  schema: DOC_SCHEMA,
  from: 'Phone',
  projectId: 'p1',
  itemId,
  update: toBase64(encodeDoc(doc)),
});

/** This device's blob of `name` on the relay, opened. */
async function mine(name: string) {
  const key = await blobKey(keys, name);
  const found = [...fake.spaces.values()][0]?.blobs.find((b) => b.key === key && b.device !== OTHER);
  return found ? openBlob(found, keys) : undefined;
}

const textOf = async (itemId: string) => (await db.itemTexts.get(itemId))?.text;

/** Adds words to the first paragraph of an item's Yjs text. */
function insert(doc: Y.Doc, at: number, words: string) {
  const paragraph = doc.getXmlFragment(YFRAGMENT).get(0) as Y.XmlElement;
  (paragraph.get(0) as Y.XmlText).insert(at, words);
}

beforeEach(async () => {
  await db.open();
  now = 1000;
  vi.spyOn(clock, 'now').mockImplementation(() => now);
  fake = new FakeSyncRelay();
  relay.fake = fake;
  spaceId = String(fake.call('create_sync_space', { p_token: TOKEN }));
  const { text: key } = await newShareKey();
  keys = await syncKeys(key);
  const record: SyncSpace = {
    spaceId,
    key,
    token: TOKEN,
    deviceId: 'device-this-00000000',
    deviceName: 'Laptop',
    cursor: '',
    pushedAt: 0,
    syncedAt: 0,
    blocked: false,
    names: {},
  };
  await db.appMeta.put({ key: SYNC_META, value: record });
  await db.projects.add(novel());
  await db.items.bulkAdd([item('ch', 'chapter', 'One'), item('s1', 'scene', 'Harbour', 'ch')]);
  await writeItemUpdate('s1', proseUpdate(['The harbour.']), 0);
});

afterEach(async () => {
  await db.delete();
  for (const d of await indexedDB.databases())
    if (d.name?.startsWith('vlo-item-')) indexedDB.deleteDatabase(d.name);
});

describe('push', () => {
  test('the first push sends each project, each text and each research file up to 2 MB, then only changes', async () => {
    await db.cards.add(card('c1', 'Storm'));
    await db.research.bulkAdd([
      {
        id: 'r1',
        projectId: 'p1',
        name: 'Map',
        type: 'text/plain',
        size: 4,
        addedAt: 0,
        data: new Blob(['tide']),
      },
      {
        id: 'r2',
        projectId: 'p1',
        name: 'Film',
        type: 'video/mp4',
        size: MAX_SYNC_FILE + 1,
        addedAt: 0,
        data: new Blob(['x']),
      },
    ]);
    now = 2000;
    expect(await syncOnce()).toEqual({ pushed: 3, pulled: 0 });
    const blob = (await mine('rows:p1')) as RowsBlob;
    expect(blob.rows.map((v) => `${v.table}:${v.id}`).sort()).toEqual([
      'cards:c1',
      'items:ch',
      'items:s1',
      'projects:p1',
    ]);
    // A folder has no text, and the large file stays on this device.
    expect(await mine('text:ch')).toBeUndefined();
    expect(await mine('file:r2')).toBeUndefined();
    expect(
      docFromUpdate(fromBase64(((await mine('text:s1')) as TextBlob).update))
        .getXmlFragment(YFRAGMENT)
        .toJSON(),
    ).toContain('The harbour.');
    const file = (await mine('file:r1')) as RowsBlob;
    expect(await (file.rows[0]?.row?.data as Blob).text()).toBe('tide');
    expect((await space()).pushedAt).toBe(2000);

    now = 3000;
    expect((await syncOnce()).pushed).toBe(0);
    await db.cards.update('c1', { title: 'Calm' });
    await db.research.delete('r1');
    expect((await syncOnce()).pushed).toBe(1);
    const next = (await mine('rows:p1')) as RowsBlob;
    expect(next.rows.find((v) => v.id === 'c1')).toMatchObject({ at: 3000, row: { title: 'Calm' } });
    expect(next.rows.find((v) => v.id === 'r1')).toEqual({ table: 'research', id: 'r1', at: 3000 });
    // The file of a deleted research row leaves the relay.
    expect(await mine('file:r1')).toBeUndefined();
  });

  // Review Focus 3: a memoir real name goes to the relay only in sealed blobs.
  test('a real name in a person, a deleted word and a comment reaches the relay only sealed', async () => {
    await db.people.add({
      id: 'rosa',
      projectId: 'p1',
      label: 'Aunt',
      variants: [{ real: 'Rosa', alias: 'Maria' }],
    });
    await db.items.add(item('m1', 'scene', 'Letters', 'ch'));
    const deleted = { type: 'suggestion', attrs: { id: 's1', kind: 'delete', pass: 1, at: 1, by: '' } };
    const comment = { type: 'comment', attrs: { id: 'c1', text: 'Ask Teo first.', at: 1, by: '' } };
    await writeItemUpdate(
      'm1',
      updateOf(
        {
          type: 'doc',
          content: [
            {
              type: 'paragraph',
              content: [
                { type: 'text', text: 'Rosa', marks: [deleted] },
                { type: 'text', text: ' wrote.', marks: [comment] },
              ],
            },
          ],
        },
        'prose',
      ),
      0,
    );
    now = 2000;
    await syncOnce();
    const blobs = [...fake.spaces.values()].flatMap((s) => s.blobs);
    expect(blobs.length).toBeGreaterThan(0);
    for (const b of blobs)
      expect(`${b.key} ${b.payload} ${new TextDecoder().decode(fromBase64(b.payload))}`).not.toMatch(
        /Rosa|Teo/,
      );
    // The sealed blobs hold both names, so the other devices get the whole memoir.
    expect(JSON.stringify(await mine('rows:p1'))).toContain('Rosa');
    const update = new TextDecoder().decode(fromBase64(((await mine('text:m1')) as TextBlob).update));
    expect(update).toContain('Rosa');
    expect(update).toContain('Ask Teo first.');
  });
});

describe('pull', () => {
  test('rows merge by time, and a delete there removes the item, its text and a whole project here', async () => {
    await db.projects.add(novel('p2'));
    await db.cards.bulkAdd([card('c1', 'Mine'), card('c2', 'Mine'), card('c9', 'Gone with p2', 'p2')]);
    await db.items.add(item('s2', 'scene', 'Gulls', 'ch'));
    await writeItemUpdate('s2', proseUpdate(['Gulls.']), 0);
    await db.itemTexts.put({ itemId: 's2', projectId: 'p1', text: 'Gulls.', updatedAt: 0 });
    now = 2000;
    await syncOnce();
    expect(await mine('text:s2')).not.toBeUndefined();

    await fromOther(
      'rows:p1',
      rows([
        { table: 'cards', id: 'c1', at: 2000, row: card('c1', 'Theirs') },
        { table: 'cards', id: 'c2', at: 500, row: card('c2', 'Old') },
        { table: 'cards', id: 'c3', at: 100, row: card('c3', 'New') },
        { table: 'items', id: 's2', at: 2000 },
      ]),
    );
    await fromOther('rows:p2', rows([{ table: 'projects', id: 'p2', at: 2000 }], 'p2'));
    now = 3000;
    const result = await syncOnce();
    expect(result).toMatchObject({ pushed: 0 });
    expect(result.pulled).toBe(4);
    expect((await db.cards.toArray()).map((c) => `${c.id} ${c.title}`).sort()).toEqual([
      'c1 Theirs',
      'c2 Mine',
      'c3 New',
    ]);
    expect(await db.items.get('s2')).toBeUndefined();
    expect(await textOf('s2')).toBeUndefined();
    expect((await indexedDB.databases()).map((d) => d.name)).not.toContain(itemDocName('s2'));
    expect(await db.projects.get('p2')).toBeUndefined();
    expect(await mine('text:s2')).toBeUndefined();
    // The changes keep the other device's times, and this device does not send them as its own.
    expect(await db.syncClock.get('cards:c1')).toMatchObject({ at: 2000, remote: true });
    expect((await syncOnce()).pushed).toBe(0);
  });

  test('two texts edited apart merge with both edits, after a "Before sync" snapshot of this one', async () => {
    const base = proseUpdate(['The harbour.']);
    await db.items.add(item('s3', 'scene', 'Night', 'ch'));
    const local = docFromUpdate(base);
    insert(local, 12, ' Gulls.');
    await writeItemUpdate('s3', encodeDoc(local), 0);
    const other = docFromUpdate(base);
    insert(other, 0, 'Night. ');
    await fromOther('text:s3', text('s3', other));
    expect(await syncOnce()).toMatchObject({ pulled: 1 });
    expect(await textOf('s3')).toBe('Night. The harbour. Gulls.');
    expect((await db.items.get('s3'))?.wordCount).toBe(4);
    const snapshots = await db.snapshots.where('itemId').equals('s3').toArray();
    expect(snapshots.map((s) => [s.label, s.text])).toEqual([[BEFORE_SYNC, 'The harbour. Gulls.']]);

    // A text that only adds to this device's text needs no snapshot.
    Y.applyUpdate(other, encodeDoc(local));
    insert(other, 0, 'Late. ');
    await fromOther('text:s3', text('s3', other));
    await syncOnce();
    expect(await textOf('s3')).toBe('Late. Night. The harbour. Gulls.');
    expect(await db.snapshots.where('itemId').equals('s3').count()).toBe(1);
  });

  test('a blob of a newer Vlo blocks the sync, and this device applies nothing', async () => {
    await fromOther(
      'rows:p1',
      rows([{ table: 'cards', id: 'c1', at: 2000, row: card('c1', 'Theirs') }], 'p1', DOC_SCHEMA + 1),
    );
    expect(await syncOnce()).toEqual({ pushed: 2, pulled: 0, blocked: 'newer-schema' });
    expect(await db.cards.count()).toBe(0);
    expect((await space()).cursor).toBe('');
  });

  test('a read starts 30 seconds before the cursor, so a put that commits late still arrives', async () => {
    await fromOther('rows:p1', rows([{ table: 'cards', id: 'c1', at: 2000, row: card('c1', 'First') }]));
    await syncOnce();
    const { cursor } = await space();
    expect(cursor).not.toBe('');
    // Two puts that commit after the read, with relay times from before it.
    const late = async (id: string, back: number) => {
      const sealed = await sealBlob(rows([{ table: 'cards', id, at: 2000, row: card(id, 'Late') }]), keys);
      [...fake.spaces.values()][0]?.blobs.push({
        device: OTHER,
        key: await blobKey(keys, `file:${id}`),
        ...sealed,
        updated_at: new Date(Date.parse(cursor) - back).toISOString(),
      });
    };
    await late('c2', 10_000);
    await late('c3', 40_000);
    await syncOnce();
    expect(await db.cards.get('c2')).toBeDefined();
    expect(await db.cards.get('c3')).toBeUndefined();
  });
});
