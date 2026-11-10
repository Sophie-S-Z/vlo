import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import {
  joinSpace,
  leaveSync,
  listDevices,
  pairingLink,
  readPairing,
  startSpace,
} from '@/features/sync/pairing';
import { readSpace, syncedText, updateSpace } from '@/features/sync/space';
import { db } from '@/lib/db';
import { FakeSyncRelay } from '../fixtures/syncRelay';

/* Plan Task I7 (roadmap F49, decision R7): the pairing link and the sync record. */

const relay = vi.hoisted(() => ({ fake: null as FakeSyncRelay | null }));
vi.mock('@/features/share/rpc', async (original) => {
  const real = await original<typeof import('@/features/share/rpc')>();
  return {
    ...real,
    rpc: (name: string, args: Record<string, unknown>) =>
      Promise.resolve().then(() => {
        try {
          return relay.fake?.call(name, args);
        } catch (error) {
          throw new real.ShareError('unavailable', String(error));
        }
      }),
  };
});

beforeEach(async () => {
  await db.open();
  relay.fake = new FakeSyncRelay();
});

afterEach(async () => {
  await db.delete();
});

test('a pairing link gives the same space, and a damaged link says so', async () => {
  const space = await startSpace('Laptop');
  const link = pairingLink(space, 'https://vlo.app');
  expect(link).toMatch(/^https:\/\/vlo\.app\/pair#p=[A-Za-z0-9_-]{107}$/);
  expect(readPairing(new URL(link).hash)).toEqual({
    spaceId: space.spaceId,
    key: space.key,
    token: space.token,
  });
  for (const hash of [new URL(link).hash.slice(0, -4), '#p=', '#k=abc', ''])
    expect(() => readPairing(hash)).toThrow('This pairing link is not complete.');
});

test('a second device joins with the link, and a link to a deleted space fails', async () => {
  const first = await startSpace('Laptop');
  await db.appMeta.clear();
  const second = await joinSpace(readPairing(new URL(pairingLink(first, 'https://vlo.app')).hash), ' Phone ');
  expect(second).toMatchObject({ spaceId: first.spaceId, key: first.key, deviceName: 'Phone', cursor: '' });
  expect(second.deviceId).not.toBe(first.deviceId);
  relay.fake?.call('delete_sync_space', { p_space: first.spaceId, p_token: first.token });
  await db.appMeta.clear();
  await expect(joinSpace(first, 'Tablet')).rejects.toThrow();
  expect(await readSpace()).toBeNull();
});

test('the device list forgets the name of a device that left', async () => {
  const space = await startSpace('Laptop');
  relay.fake?.call('sync_put', {
    p_space: space.spaceId,
    p_token: space.token,
    p_device: 'phone-device-0000000',
    p_key: 'k',
    p_payload: 'x',
    p_iv: 'y',
  });
  await updateSpace(space.spaceId, {
    names: { 'phone-device-0000000': 'Phone', 'old-device-00000000': 'Old' },
  });
  expect((await listDevices(space)).map((d) => d.device)).toEqual(['phone-device-0000000']);
  expect((await readSpace())?.names).toEqual({ 'phone-device-0000000': 'Phone' });
});

test('leaveSync ends sync and keeps every project on the device', async () => {
  const space = await startSpace('Laptop');
  await db.projects.add({ id: 'p1', title: 'Salt' } as never);
  await leaveSync(space);
  expect(await readSpace()).toBeNull();
  expect(await db.projects.count()).toBe(1);
});

test('syncedText says how long ago the last sync was', () => {
  const now = Date.UTC(2026, 10, 10, 12);
  expect(syncedText(0, now)).toBe('Not synced yet');
  expect(syncedText(now - 20_000, now)).toBe('Synced just now');
  expect(syncedText(now - 5 * 60_000, now)).toBe('Synced 5 min ago');
  expect(syncedText(now - 3 * 3_600_000, now)).toBe('Synced 3 h ago');
  expect(syncedText(Date.UTC(2026, 10, 9, 12), now)).toBe('Synced on 9 November');
});
