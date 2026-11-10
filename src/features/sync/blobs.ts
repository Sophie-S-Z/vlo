import {
  fromBase64,
  hmacName,
  importNameKey,
  importShareKey,
  openJson,
  sealJson,
  toBase64,
  type Sealed,
} from '@/lib/crypto';
import { DOC_SCHEMA } from '@/features/editor/docSchema';
import { SYNC_TABLES } from './clock';
import type { Version } from './merge';

/*
 * The sealed blobs of sync (ADR 0008). A rows blob holds a project's rows and deletes, a text blob an
 * item's whole Yjs state, and a file blob one research file of at most 2 MB. Each carries the DOC_SCHEMA
 * of the device that made it.
 */

/** The rows of one project, or one research file, as one device has them. */
export interface RowsBlob {
  v: 1;
  schema: number;
  /** The name of the device that made the blob, for the Devices list of the other devices. */
  from: string;
  projectId: string;
  rows: Version[];
}

export interface TextBlob {
  v: 1;
  schema: number;
  from: string;
  projectId: string;
  itemId: string;
  /** Base64 of the item's Yjs state. */
  update: string;
}

/** The largest research file that syncs (decision R5). A larger file stays on its device. */
export const MAX_SYNC_FILE = 2 * 1024 * 1024;

export interface SyncKeys {
  seal: CryptoKey;
  name: CryptoKey;
}

export async function syncKeys(text: string): Promise<SyncKeys> {
  return { seal: await importShareKey(text), name: await importNameKey(text) };
}

/** The relay's key of a blob, such as `rows:<project id>`: an HMAC, so the relay sees no id. */
export function blobKey(keys: SyncKeys, name: string): Promise<string> {
  return hmacName(keys.name, name);
}

/** A research file's bytes go in the JSON as base64. */
async function packRow(version: Version): Promise<Version> {
  const data = version.row?.data;
  if (version.table !== 'research' || !(data instanceof Blob)) return version;
  return { ...version, row: { ...version.row, data: toBase64(new Uint8Array(await data.arrayBuffer())) } };
}

function unpackRow(version: Version): Version {
  const row = version.row;
  if (version.table !== 'research' || typeof row?.data !== 'string') return version;
  return { ...version, row: { ...row, data: new Blob([fromBase64(row.data)], { type: String(row.type) }) } };
}

export async function sealBlob(blob: RowsBlob | TextBlob, keys: SyncKeys): Promise<Sealed> {
  const packed = 'rows' in blob ? { ...blob, rows: await Promise.all(blob.rows.map(packRow)) } : blob;
  return sealJson(packed, keys.seal, 'sync');
}

const tables = new Set<string>(SYNC_TABLES);

function isVersion(value: unknown): value is Version {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  const row = v.row as Record<string, unknown> | null | undefined;
  return (
    tables.has(v.table as string) &&
    typeof v.id === 'string' &&
    typeof v.at === 'number' &&
    (row === undefined || (typeof row === 'object' && row !== null && row.id === v.id))
  );
}

/**
 * The blob in a sealed value. 'newer' when a newer Vlo made it, so this build must not apply it. Null when
 * it does not open with these keys or has another shape.
 */
export async function openBlob(
  sealed: Sealed,
  keys: SyncKeys,
): Promise<RowsBlob | TextBlob | 'newer' | null> {
  let value: Partial<RowsBlob & TextBlob> | null;
  try {
    value = (await openJson(sealed, keys.seal, 'sync')) as Partial<RowsBlob & TextBlob> | null;
  } catch {
    return null;
  }
  if (typeof value !== 'object' || value === null) return null;
  if (typeof value.schema === 'number' && value.schema > DOC_SCHEMA) return 'newer';
  if (value.v !== 1 || typeof value.schema !== 'number' || typeof value.projectId !== 'string') return null;
  const head = {
    v: 1 as const,
    schema: value.schema,
    from: typeof value.from === 'string' ? value.from.slice(0, 80) : '',
    projectId: value.projectId,
  };
  if (Array.isArray(value.rows) && value.rows.every(isVersion))
    return { ...head, rows: value.rows.map(unpackRow) };
  if (typeof value.itemId === 'string' && typeof value.update === 'string')
    return { ...head, itemId: value.itemId, update: value.update };
  return null;
}
