import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { resetSigningKey } from '@/features/authorship/keys';
import { exportRecord, flushEntry, noteChange, resetPending } from '@/features/authorship/record';
import { verifyRecord } from '@/features/authorship/verify';
import { db } from '@/lib/db';

/* Plan Task K6 (roadmap F54, Review Focus 1): the check of a record file. */

/** A record of `count` entries of one device, made as the editor makes them. */
async function record(count: number): Promise<string> {
  for (let i = 0; i < count; i += 1) {
    noteChange('p1', 'typed', 10 + i, i);
    await flushEntry('p1');
  }
  return (await exportRecord('p1')) ?? '';
}

type FileShape = { entries: Record<string, unknown>[] } & Record<string, unknown>;
const edit = (json: string, change: (file: FileShape) => void) => {
  const file = JSON.parse(json) as FileShape;
  change(file);
  return JSON.stringify(file);
};

beforeEach(async () => {
  await db.open();
});

afterEach(async () => {
  resetPending();
  resetSigningKey();
  await db.delete();
});

describe('verifyRecord', () => {
  test('a good record passes, with its totals, time span and device', async () => {
    const result = await verifyRecord(await record(3));
    expect(result).toMatchObject({
      ok: true,
      totals: { typed: 33, deleted: 3, pasted: 0, dictated: 0, ai: 0, minutes: 3 },
      devices: [{ entries: 3 }],
    });
    if (result.ok) expect(result.devices[0]?.fingerprint).toMatch(/^[0-9a-f]{16}$/);
  });

  test('a change of any one byte fails', async () => {
    const json = await record(2);
    const bytes = new TextEncoder().encode(json);
    const passed: number[] = [];
    for (let i = 0; i < bytes.length; i += 1) {
      const changed = bytes.slice();
      changed[i] = (changed[i] ?? 0) ^ 1;
      if ((await verifyRecord(new TextDecoder().decode(changed))).ok) passed.push(i);
    }
    expect(passed).toEqual([]);
  }, 60_000);

  test('a removed entry and two swapped entries fail, and name the entry', async () => {
    const json = await record(3);
    expect(await verifyRecord(edit(json, (f) => f.entries.splice(1, 1)))).toEqual({
      ok: false,
      reason: 'An entry is missing or out of order before this one.',
      entry: 2,
    });
    const swapped = await verifyRecord(
      edit(json, (f) => {
        f.entries = [f.entries[0] ?? {}, f.entries[2] ?? {}, f.entries[1] ?? {}];
      }),
    );
    expect(swapped).toMatchObject({ ok: false, entry: 2 });
  });

  test('a new key with a good chain passes, but shows a new device', async () => {
    const first = await verifyRecord(await record(1));
    await db.delete();
    await db.open();
    resetSigningKey();
    const second = await verifyRecord(await record(1));
    expect(first.ok && second.ok).toBe(true);
    if (first.ok && second.ok) expect(second.devices[0]?.fingerprint).not.toBe(first.devices[0]?.fingerprint);
  });

  test('a key that is not the device of its chain fails', async () => {
    const mine = await record(1);
    await db.delete();
    await db.open();
    resetSigningKey();
    const other = JSON.parse(await record(1)) as FileShape;
    const swappedKey = edit(mine, (f) => {
      if (f.entries[0]) f.entries[0].key = other.entries[0]?.key;
    });
    expect(await verifyRecord(swappedKey)).toEqual({
      ok: false,
      reason: 'The device key does not match the device of this entry.',
      entry: 1,
    });
  });

  test('a file that is not a record says why', async () => {
    expect(await verifyRecord('not json')).toEqual({
      ok: false,
      reason: 'This file is not an authorship record: it is not JSON.',
      entry: null,
    });
    expect(await verifyRecord('{"format":"vlo-backup"}')).toMatchObject({ ok: false, entry: null });
    expect(await verifyRecord('{"format":"vlo-authorship-record","version":2,"entries":[]}')).toMatchObject({
      ok: false,
      reason: 'This record has a version that this check does not know.',
    });
  });
});
