import { db } from '@/lib/db';

/*
 * This device's sync record (ADR 0008): the space, its key and token, and how far this device got. It
 * stays on this device in `appMeta`, and no backup or export holds it. The app shell and the safety badge
 * read it, so this module holds no relay or crypto code.
 */

export const SYNC_META = 'sync';

/** What a device says when another device has a newer Vlo, so it applies nothing (ADR 0008). */
export const BLOCKED_TEXT = 'Update Vlo on this device to sync.';

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
  /** This device's time at the end of its last round that went through, or 0. */
  syncedAt: number;
  /** True when a blob of a newer Vlo stopped the last round. */
  blocked: boolean;
  /** The names of the other devices, by device id, from their blobs. */
  names: Record<string, string>;
}

export type Pairing = Pick<SyncSpace, 'spaceId' | 'key' | 'token'>;

export async function readSpace(): Promise<SyncSpace | null> {
  return ((await db.appMeta.get(SYNC_META))?.value as SyncSpace | undefined) ?? null;
}

/** Saves how far a sync got. Nothing changes when sync stopped or moved to another space meanwhile. */
export async function updateSpace(
  spaceId: string,
  changes: Partial<Pick<SyncSpace, 'cursor' | 'pushedAt' | 'syncedAt' | 'blocked' | 'names'>>,
): Promise<void> {
  await db.appMeta
    .where('key')
    .equals(SYNC_META)
    .modify((meta) => {
      const space = meta.value as SyncSpace;
      if (space.spaceId === spaceId) meta.value = { ...space, ...changes };
    });
}

/** "Synced just now", "Synced 5 min ago", "Synced 3 h ago" or "Synced on 9 November". */
export function syncedText(at: number, now: number): string {
  if (at === 0) return 'Not synced yet';
  const minutes = Math.floor((now - at) / 60_000);
  if (minutes < 1) return 'Synced just now';
  if (minutes < 60) return `Synced ${String(minutes)} min ago`;
  if (minutes < 24 * 60) return `Synced ${String(Math.floor(minutes / 60))} h ago`;
  return `Synced on ${new Date(at).toLocaleDateString('en-GB', { day: 'numeric', month: 'long' })}`;
}
