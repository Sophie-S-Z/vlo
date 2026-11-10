import { rpc, ShareError } from '@/features/share/rpc';
import { fromBase64Url, newOwnerToken, newShareKey, toBase64Url } from '@/lib/crypto';
import { db } from '@/lib/db';
import { readSpace, SYNC_META, updateSpace, type Pairing, type SyncSpace } from './space';

/*
 * Pairing and the relay calls of the Devices screen (plan Task I7, ADR 0008). A pairing link carries the
 * space, the key and the token to another device in its fragment, which no browser sends.
 */

const PAIR_BYTES = 16 + 32 + 32;
export const BROKEN_LINK = 'This pairing link is not complete. Copy the whole link again.';

/** The pairing link: `/pair#p=` and the space id, the key and the token as one base64url text. */
export function pairingLink({ spaceId, key, token }: Pairing, origin = window.location.origin): string {
  const id = Uint8Array.from(spaceId.replace(/-/g, '').match(/../g) ?? [], (hex) => parseInt(hex, 16));
  const bytes = new Uint8Array(PAIR_BYTES);
  bytes.set(id);
  bytes.set(fromBase64Url(key), 16);
  bytes.set(fromBase64Url(token), 48);
  return `${origin}/pair#p=${toBase64Url(bytes)}`;
}

/** The space of a pairing link's fragment. Throws an Error with the text for the writer when it is damaged. */
export function readPairing(hash: string): Pairing {
  const text = new URLSearchParams(hash.replace(/^#/, '')).get('p') ?? '';
  let bytes: Uint8Array;
  try {
    bytes = fromBase64Url(text);
  } catch {
    throw new Error(BROKEN_LINK);
  }
  if (!/^[A-Za-z0-9_-]+$/.test(text) || bytes.length !== PAIR_BYTES) throw new Error(BROKEN_LINK);
  const hex = Array.from(bytes.subarray(0, 16), (b) => b.toString(16).padStart(2, '0')).join('');
  return {
    spaceId: `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`,
    key: toBase64Url(bytes.subarray(16, 48)),
    token: toBase64Url(bytes.subarray(48)),
  };
}

async function saveSpace(pairing: Pairing, deviceName: string): Promise<SyncSpace> {
  const space: SyncSpace = {
    ...pairing,
    deviceId: crypto.randomUUID().replace(/-/g, ''),
    deviceName: deviceName.trim() || 'A device',
    cursor: '',
    pushedAt: 0,
    syncedAt: 0,
    blocked: false,
    names: {},
  };
  await db.appMeta.put({ key: SYNC_META, value: space });
  return space;
}

/** Makes a new sync space with this device in it (the first device). */
export async function startSpace(deviceName: string): Promise<SyncSpace> {
  const key = (await newShareKey()).text;
  const token = newOwnerToken();
  const spaceId = await rpc<string>('create_sync_space', { p_token: token }, 'sync');
  return saveSpace({ spaceId, key, token }, deviceName);
}

/** Each device of the space, oldest first, with the time of its last change. */
export async function listDevices(
  space: Pick<Pairing, 'spaceId' | 'token'>,
): Promise<{ device: string; updated_at: string; size: number }[]> {
  const devices = await rpc<{ device: string; updated_at: string; size: number }[]>(
    'sync_devices',
    { p_space: space.spaceId, p_token: space.token },
    'sync',
  );
  // A device that left has no blobs on the relay, so this device forgets its name and stops counting it.
  const ids = new Set(devices.map((d) => d.device));
  const record = await readSpace();
  if (record?.spaceId === space.spaceId && Object.keys(record.names).some((id) => !ids.has(id)))
    await updateSpace(space.spaceId, {
      names: Object.fromEntries(Object.entries(record.names).filter(([id]) => ids.has(id))),
    });
  return devices;
}

/** Joins the space of a pairing link. The relay checks the token first. */
export async function joinSpace(pairing: Pairing, deviceName: string): Promise<SyncSpace> {
  await listDevices(pairing);
  return saveSpace(pairing, deviceName);
}

/** Runs a relay call, and goes on when the space is gone already. */
async function unlessGone(call: Promise<unknown>): Promise<void> {
  try {
    await call;
  } catch (error) {
    if (!(error instanceof ShareError && error.kind === 'unavailable')) throw error;
  }
}

/** This device leaves sync: its blobs leave the relay, and every project stays on this device. */
export async function leaveSync(space: SyncSpace): Promise<void> {
  await unlessGone(
    rpc('leave_sync', { p_space: space.spaceId, p_token: space.token, p_device: space.deviceId }, 'sync'),
  );
  await db.appMeta.delete(SYNC_META);
}

/** Sync stops on every device: the relay deletes the space. Each device keeps its projects. */
export async function stopSyncEverywhere(space: SyncSpace): Promise<void> {
  await unlessGone(rpc('delete_sync_space', { p_space: space.spaceId, p_token: space.token }, 'sync'));
  await db.appMeta.delete(SYNC_META);
}

/** The text for the writer of a failed sync call. */
export function syncErrorText(error: unknown): string {
  const kind = error instanceof ShareError ? error.kind : 'server';
  if (kind === 'not-set-up') return 'Sync is not set up in this build.';
  if (kind === 'offline') return 'Vlo could not reach the sync server. Check the connection, then try again.';
  if (kind === 'unavailable') return 'This sync stopped. Make a new pairing link on your other device.';
  if (kind === 'limit') return 'This sync is full. It can have 5 devices and 100 MB.';
  if (kind === 'busy') return 'The sync server is at its limit for now. Try again in an hour.';
  return 'The sync server refused the request. Try again later.';
}
