import { gunzip, gzip } from '@/lib/crypto';
import type { Snapshot } from '@/lib/db';

/**
 * A snapshot's state in gzip, which takes about half the space on the device. A browser with no
 * CompressionStream keeps the state as it is.
 */
export async function pack(state: Uint8Array): Promise<Pick<Snapshot, 'state' | 'packed'>> {
  if (typeof CompressionStream === 'undefined') return { state };
  return { state: await gzip(new Uint8Array(state)), packed: true };
}

/** A snapshot's Yjs state as one update. */
export async function snapshotState(snapshot: Pick<Snapshot, 'state' | 'packed'>): Promise<Uint8Array> {
  return snapshot.packed ? gunzip(new Uint8Array(snapshot.state)) : snapshot.state;
}

/** The snapshot with its state as a plain Yjs update, as a backup file holds it. */
export async function unpackSnapshot(snapshot: Snapshot): Promise<Snapshot> {
  if (!snapshot.packed) return snapshot;
  const plain: Snapshot = { ...snapshot, state: await snapshotState(snapshot) };
  delete plain.packed;
  return plain;
}
