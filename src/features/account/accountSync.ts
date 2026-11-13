import { forgetSpace, joinSpace, leaveSync, startSpace } from '@/features/sync/pairing';
import { readSpace, type SyncSpace } from '@/features/sync/space';
import { db } from '@/lib/db';
import { accountRpc } from './auth';
import { unwrapSyncKey, wrapSyncKey, type Wrapped } from './vault';

/*
 * Sync with an account (Phase 18, Task A3, ADR 0009). The account holds the sync space of ADR 0008 and
 * its key, wrapped with the sync passphrase. The first device makes the space, or gives the space that it
 * syncs with already. Each next device signs in, types the passphrase, and joins the space. The engine of
 * ADR 0008 does the rest, so the projects of each device merge with no lost word.
 */

export interface Vault extends Wrapped {
  space_id: string;
  token: string;
  updated_at: string;
}

/**
 * What the account page shows:
 * - `off`: the account has no sync, and this device does not sync.
 * - `adopt`: the account has no sync, and this device syncs with a pairing link.
 * - `on`: this device syncs with the account's space.
 * - `join`: the account has sync, and this device does not sync.
 * - `move`: the account has sync, and this device syncs with another space.
 */
export type AccountSyncState =
  | { kind: 'off' }
  | { kind: 'adopt'; space: SyncSpace }
  | { kind: 'on'; space: SyncSpace; vault: Vault }
  | { kind: 'join'; vault: Vault }
  | { kind: 'move'; space: SyncSpace; vault: Vault };

export async function readVault(): Promise<Vault | null> {
  const rows = await accountRpc<Vault[]>('vault_get');
  return rows[0] ?? null;
}

export async function accountSyncState(): Promise<AccountSyncState> {
  const [vault, space] = await Promise.all([readVault(), readSpace()]);
  if (!vault) return space ? { kind: 'adopt', space } : { kind: 'off' };
  if (!space) return { kind: 'join', vault };
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

async function saveVault(space: Pick<SyncSpace, 'spaceId' | 'token' | 'key'>, passphrase: string) {
  const wrapped = await wrapSyncKey(space.key, passphrase);
  await accountRpc('vault_put', {
    p_space: space.spaceId,
    p_token: space.token,
    p_wrapped: wrapped.wrapped,
    p_iv: wrapped.iv,
    p_salt: wrapped.salt,
    p_rounds: wrapped.rounds,
  });
}

/**
 * Turns on sync for the account from this device. A device that syncs with a pairing link gives that
 * space to the account. Any other device makes a new space.
 */
export async function turnOnAccountSync(passphrase: string, deviceName: string): Promise<void> {
  const current = await readSpace();
  const space = current ?? (await startSpace(deviceName));
  await rememberDevice(space);
  await saveVault(space, passphrase);
}

/**
 * Joins the account's space with the passphrase. A device that syncs with another space leaves it first,
 * and its projects stay here and go to the account's space. A wrong passphrase throws
 * CryptoError('bad-key') and changes nothing.
 */
export async function joinAccountSync(vault: Vault, passphrase: string, deviceName: string): Promise<void> {
  const key = await unwrapSyncKey(vault, passphrase);
  const current = await readSpace();
  if (current?.spaceId === vault.space_id) return;
  if (current) await leaveSync(current);
  await joinSpace(
    { spaceId: vault.space_id, key, token: vault.token },
    deviceName,
    await deviceIdFor(vault.space_id),
  );
}

/** Wraps the key again with a new passphrase. Only a device in the account's space can do it. */
export async function changePassphrase(passphrase: string): Promise<void> {
  const space = await readSpace();
  if (!space) throw new Error('This device does not sync.');
  await saveVault(space, passphrase);
}

/**
 * For a writer who lost the passphrase: this device leaves its space and starts a new one for the
 * account. Its projects go to the new space. Each other device asks for the new passphrase.
 */
export async function restartAccountSync(passphrase: string, deviceName: string): Promise<void> {
  const current = await readSpace();
  if (current) await leaveSync(current);
  const space = await startSpace(deviceName);
  await rememberDevice(space);
  await saveVault(space, passphrase);
}

/** On sign-out, this device stops sync and keeps its projects. Its sealed copies stay for the others. */
export async function stopAccountSyncHere(): Promise<void> {
  const space = await readSpace();
  if (space) await rememberDevice(space);
  await forgetSpace();
}
