import { ShareError } from '@/features/share/rpc';
import { forgetSpace, joinSpace, leaveSync, listDevices, startSpace } from '@/features/sync/pairing';
import { readSpace, type SyncSpace } from '@/features/sync/space';
import { db } from '@/lib/db';
import { accountRpc } from './auth';

/*
 * Sync with an account (Phase 18, Task A3, ADR 0009). The account holds the sync space of ADR 0008, its
 * token and its key, so a new device needs only the sign-in (decision A1: the product owner chose no
 * passphrase). The first device makes the space, or gives the space that it syncs with already. Each next
 * device signs in and joins the space. The engine of ADR 0008 does the rest, so the projects of each
 * device merge with no lost word.
 */

export interface Vault {
  space_id: string;
  token: string;
  /** The 32-byte sync key in base64url. */
  key: string;
  updated_at: string;
}

/**
 * What the account page shows:
 * - `off`: the account has no sync, and this device does not sync.
 * - `adopt`: the account has no sync, and this device syncs with a pairing link.
 * - `on`: this device syncs with the account's space.
 * - `join`: the account has sync, and this device does not sync.
 * - `paused`: the account has sync, and the writer stopped sync on this device in Settings.
 * - `move`: the account has sync, and this device syncs with another space.
 */
export type AccountSyncState =
  | { kind: 'off' }
  | { kind: 'adopt'; space: SyncSpace }
  | { kind: 'on'; space: SyncSpace; vault: Vault }
  | { kind: 'join'; vault: Vault }
  | { kind: 'paused'; vault: Vault }
  | { kind: 'move'; space: SyncSpace; vault: Vault };

export async function readVault(): Promise<Vault | null> {
  const rows = await accountRpc<Vault[]>('vault_get');
  return rows[0] ?? null;
}

export async function accountSyncState(): Promise<AccountSyncState> {
  const [vault, space] = await Promise.all([readVault(), readSpace()]);
  if (!vault) return space ? { kind: 'adopt', space } : { kind: 'off' };
  if (!space) return (await accountSyncPaused()) ? { kind: 'paused', vault } : { kind: 'join', vault };
  return space.spaceId === vault.space_id ? { kind: 'on', space, vault } : { kind: 'move', space, vault };
}

const DEVICE_IDS = 'sync-devices';

/** This device's id in a space, kept across sign-outs, so the relay counts this device once. */
async function deviceIdFor(spaceId: string): Promise<string> {
  const ids = ((await db.appMeta.get(DEVICE_IDS))?.value ?? {}) as Record<string, string>;
  const id = ids[spaceId] ?? crypto.randomUUID().replace(/-/g, '');
  if (ids[spaceId] !== id) await db.appMeta.put({ key: DEVICE_IDS, value: { ...ids, [spaceId]: id } });
  return id;
}

async function rememberDevice(space: SyncSpace): Promise<void> {
  const ids = ((await db.appMeta.get(DEVICE_IDS))?.value ?? {}) as Record<string, string>;
  await db.appMeta.put({ key: DEVICE_IDS, value: { ...ids, [space.spaceId]: space.deviceId } });
}

async function saveVault(space: Pick<SyncSpace, 'spaceId' | 'token' | 'key'>) {
  await accountRpc('vault_put', { p_space: space.spaceId, p_token: space.token, p_key: space.key });
}

/**
 * Turns on sync for the account from this device. A device that syncs with a pairing link gives that
 * space to the account. Any other device makes a new space.
 */
export async function turnOnAccountSync(deviceName: string): Promise<void> {
  const current = await readSpace();
  const space = current ?? (await startSpace(deviceName));
  await rememberDevice(space);
  await saveVault(space);
  await db.appMeta.delete(PAUSED);
}

/** The relay keeps the blobs of at most this many devices in a space (migration 0005). */
const MAX_DEVICES = 5;

/**
 * Set when the writer stops sync on this device in Settings. The account keeps its sync, so the Account
 * page must not turn it on here again by itself. A new sign-in or the writer's own press clears it.
 */
const PAUSED = 'account-sync-paused';

export async function pauseAccountSyncHere(): Promise<void> {
  await db.appMeta.put({ key: PAUSED, value: true });
}

export async function accountSyncPaused(): Promise<boolean> {
  return (await db.appMeta.get(PAUSED))?.value === true;
}

/** A new sign-in turns sync on again (decision A1). */
export async function clearAccountSyncPause(): Promise<void> {
  await db.appMeta.delete(PAUSED);
}

/**
 * Joins the account's space. A device that syncs with another space leaves it first, and its projects
 * stay here and go to the account's space.
 */
export async function joinAccountSync(vault: Vault, deviceName: string): Promise<void> {
  const current = await readSpace();
  if (current?.spaceId === vault.space_id) return;
  const deviceId = await deviceIdFor(vault.space_id);
  if (current) {
    // The account's space must take this device before it leaves its pairing group, or it syncs with no one.
    const devices = await listDevices({ spaceId: vault.space_id, token: vault.token });
    if (!devices.some((d) => d.device === deviceId) && devices.length >= MAX_DEVICES)
      throw new ShareError('limit');
    await leaveSync(current);
  }
  await joinSpace({ spaceId: vault.space_id, key: vault.key, token: vault.token }, deviceName, deviceId);
  await db.appMeta.delete(PAUSED);
}

/** On sign-out, this device stops sync and keeps its projects. Its sealed copies stay for the others. */
export async function stopAccountSyncHere(): Promise<void> {
  const space = await readSpace();
  if (space) await rememberDevice(space);
  await forgetSpace();
}
