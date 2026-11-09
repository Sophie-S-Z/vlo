import { db } from '@/lib/db';

/*
 * This device's sync record (ADR 0008): the space, its key and token, and how far this device got. It
 * stays on this device in `appMeta`, and no backup or export holds it.
 */

export const SYNC_META = 'sync';

export interface SyncSpace {
  spaceId: string;
  /** Base64url of the 32-byte sync key. */
  key: string;
  /** Base64url of the 32-byte space token. The relay keeps only its SHA-256. */
  token: string;
  /** A random id that the relay knows this device by. */
  deviceId: string;
  deviceName: string;
  /** The relay time of the newest blob that this device read, or empty before the first read. */
  cursor: string;
  /** This device's time at the start of its last push that went through, or 0. */
  pushedAt: number;
}

export async function readSpace(): Promise<SyncSpace | null> {
  return ((await db.appMeta.get(SYNC_META))?.value as SyncSpace | undefined) ?? null;
}

/** Saves how far a sync got. Nothing changes when sync stopped or moved to another space meanwhile. */
export async function updateSpace(
  spaceId: string,
  changes: Partial<Pick<SyncSpace, 'cursor' | 'pushedAt'>>,
): Promise<void> {
  await db.appMeta
    .where('key')
    .equals(SYNC_META)
    .modify((meta) => {
      const space = meta.value as SyncSpace;
      if (space.spaceId === spaceId) meta.value = { ...space, ...changes };
    });
}
