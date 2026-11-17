import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { accountSyncState, pauseAccountSyncHere, startAccountSync } from '@/features/account/accountSync';
import { syncOnce } from '@/features/sync/engine';
import { startSpace, stopSyncEverywhere } from '@/features/sync/pairing';
import { readSpace } from '@/features/sync/space';
import { db } from '@/lib/db';
import { FakeSyncRelay } from '../fixtures/syncRelay';

/* "Stop sync on all devices" must stay stopped on a signed-in device, on this one and on the others. */

const state = vi.hoisted(() => ({
  relay: null as FakeSyncRelay | null,
  vault: null as { space_id: string; token: string; key: string } | null,
}));

vi.mock('@/features/share/rpc', async (original) => {
  const real = await original<typeof import('@/features/share/rpc')>();
  return {
    ...real,
    rpc: (name: string, args: Record<string, unknown>) =>
      Promise.resolve().then(() => {
        try {
          const answer = state.relay?.call(name, args);
          // The account's vault goes with its space (on delete cascade, migration 0008).
          if (name === 'delete_sync_space' && state.vault?.space_id === args.p_space) state.vault = null;
          return answer;
        } catch (error) {
          throw new real.ShareError('unavailable', String(error));
        }
      }),
  };
});

vi.mock('@/features/account/auth', async (original) => ({
  ...(await original<typeof import('@/features/account/auth')>()),
  accountRpc: (name: string, args: Record<string, string> = {}) => {
    if (name === 'vault_get') return Promise.resolve(state.vault ? [state.vault] : []);
    if (name === 'vault_put') {
      state.vault = { space_id: args.p_space ?? '', token: args.p_token ?? '', key: args.p_key ?? '' };
      return Promise.resolve(null);
    }
    return Promise.reject(new Error(`No fake for ${name}.`));
  },
}));

beforeEach(async () => {
  await db.open();
  state.relay = new FakeSyncRelay();
  state.vault = null;
});

afterEach(async () => {
  await db.delete();
});

test('a signed-in device with no sync turns it on by itself', async () => {
  expect((await startAccountSync('Laptop')).kind).toBe('off');
  expect((await accountSyncState()).kind).toBe('on');
});

test('after "Stop sync on all devices", this device does not make a new space by itself', async () => {
  await startAccountSync('Laptop');
  const space = await readSpace();
  if (!space) throw new Error('No space.');
  await pauseAccountSyncHere();
  await stopSyncEverywhere(space);
  expect((await startAccountSync('Laptop')).kind).toBe('stopped');
  expect(await readSpace()).toBeNull();
  expect(state.vault).toBeNull();
});

test('another device that finds the space gone stops too, and does not make a new space', async () => {
  // The other device's space is gone, as after "Stop sync on all devices" on the laptop.
  const phone = await startSpace('Phone');
  state.relay?.call('delete_sync_space', { p_space: phone.spaceId, p_token: phone.token });
  await expect(syncOnce()).rejects.toThrow();
  expect(await readSpace()).toBeNull();
  expect((await startAccountSync('Phone')).kind).toBe('stopped');
  expect(await readSpace()).toBeNull();
});
