import type { AuthorshipEntry, DeviceKey } from '@/lib/db';

/*
 * The authorship record file and its check (roadmap F54, plan Tasks K5 and K6, decision K1). The check
 * runs in the browser with no network. `docs/authorship-record.md` gives the same steps, so anyone can
 * check a record with no Vlo code.
 */

export const RECORD_FORMAT = 'vlo-authorship-record';
export const RECORD_VERSION = 1;

/** An entry as the file holds it: no row id and no project id. */
export type RecordEntry = Omit<AuthorshipEntry, 'id' | 'projectId'>;

/** The fields of an entry in the file, in order. `key` comes last, in the first entry of a chain only. */
const FIELDS = [
  'device',
  'seq',
  'at',
  'minutes',
  'typed',
  'pasted',
  'dictated',
  'ai',
  'deleted',
  'words',
  'prev',
  'hash',
  'sig',
] as const;
const COUNTS = ['seq', 'at', 'minutes', 'typed', 'pasted', 'dictated', 'ai', 'deleted', 'words'] as const;
const SOURCES = ['typed', 'pasted', 'dictated', 'ai', 'deleted'] as const;
const SIGN = { name: 'ECDSA', hash: 'SHA-256' } as const;
const CURVE = { name: 'ECDSA', namedCurve: 'P-256' } as const;
const HEX64 = /^[0-9a-f]{64}$/;
const HEX128 = /^[0-9a-f]{128}$/;

export const toHex = (bytes: ArrayBuffer): string =>
  [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, '0')).join('');

const fromHex = (hex: string): Uint8Array<ArrayBuffer> =>
  new Uint8Array((hex.match(/../g) ?? []).map((pair) => parseInt(pair, 16)));

export async function sha256Hex(text: string): Promise<string> {
  return toHex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)));
}

/** The text of a public key that its device id hashes: the four JWK fields in this order. */
export const keyText = (key: DeviceKey): string =>
  JSON.stringify({ crv: key.crv, kty: key.kty, x: key.x, y: key.y });

/** The text that an entry's hash covers and its key signs. */
export const entryText = (e: Omit<RecordEntry, 'hash' | 'sig' | 'key'>): string =>
  JSON.stringify([
    `${RECORD_FORMAT}/${String(RECORD_VERSION)}`,
    e.device,
    e.seq,
    e.at,
    e.minutes,
    e.typed,
    e.pasted,
    e.dictated,
    e.ai,
    e.deleted,
    e.words,
    e.prev,
  ]);

export const importKey = (key: DeviceKey, usage: 'verify'): Promise<CryptoKey> =>
  crypto.subtle.importKey('jwk', { ...key, ext: true }, CURVE, true, [usage]);

/** The file of a record: its entries in a fixed form, with no space, so each byte counts. */
export function recordFile(entries: readonly RecordEntry[]): string {
  const out = entries.map((e) => {
    const row: Record<string, unknown> = {};
    for (const field of FIELDS) row[field] = e[field];
    if (e.key) row.key = { crv: e.key.crv, kty: e.key.kty, x: e.key.x, y: e.key.y };
    return row;
  });
  return JSON.stringify({ format: RECORD_FORMAT, version: RECORD_VERSION, entries: out });
}

export interface DeviceSummary {
  /** The first 16 hex digits of the device id. */
  fingerprint: string;
  entries: number;
}

export type VerifyResult =
  | {
      ok: true;
      devices: DeviceSummary[];
      totals: Record<(typeof SOURCES)[number] | 'minutes', number>;
      /** The time of the first and the last entry. */
      first: number;
      last: number;
      /** The words of the project in the last entry. */
      words: number;
    }
  | {
      ok: false;
      reason: string;
      /** The number of the entry that fails, from 1, or null for the whole file. */
      entry: number | null;
    };

class Bad extends Error {
  constructor(
    message: string,
    readonly entry: number | null,
  ) {
    super(message);
  }
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const sameKeys = (value: Record<string, unknown>, keys: readonly string[]) =>
  Object.keys(value).length === keys.length && keys.every((k) => k in value);

/** The entry at `n` (from 1) with each field of the right type, or a failure that names it. */
function readEntry(value: unknown, n: number): RecordEntry {
  if (!isObject(value)) throw new Bad('This entry is not an object.', n);
  const first = value.seq === 0;
  if (!sameKeys(value, first ? [...FIELDS, 'key'] : FIELDS))
    throw new Bad(
      first ? 'This entry has wrong fields, or no device key.' : 'This entry has wrong fields.',
      n,
    );
  for (const field of COUNTS) {
    const count = value[field];
    if (typeof count !== 'number' || !Number.isSafeInteger(count) || count < 0)
      throw new Bad(`This entry has a wrong ${field}.`, n);
  }
  if (typeof value.device !== 'string' || !HEX64.test(value.device))
    throw new Bad('This entry has a wrong device.', n);
  if (typeof value.hash !== 'string' || !HEX64.test(value.hash))
    throw new Bad('This entry has a wrong hash.', n);
  if (typeof value.sig !== 'string' || !HEX128.test(value.sig))
    throw new Bad('This entry has a wrong signature.', n);
  if (typeof value.prev !== 'string' || !(first ? value.prev === '' : HEX64.test(value.prev)))
    throw new Bad('This entry has a wrong link to the entry before.', n);
  if (first) {
    const key = value.key;
    if (
      !isObject(key) ||
      !sameKeys(key, ['crv', 'kty', 'x', 'y']) ||
      key.crv !== 'P-256' ||
      key.kty !== 'EC' ||
      typeof key.x !== 'string' ||
      typeof key.y !== 'string'
    )
      throw new Bad('This entry has a wrong device key.', n);
  }
  return value as unknown as RecordEntry;
}

interface Chain {
  key: CryptoKey;
  next: number;
  prev: string;
  entries: number;
}

async function check(json: string): Promise<VerifyResult> {
  let file: unknown;
  try {
    file = JSON.parse(json);
  } catch {
    throw new Bad('This file is not an authorship record: it is not JSON.', null);
  }
  if (
    !isObject(file) ||
    !sameKeys(file, ['format', 'version', 'entries']) ||
    file.format !== RECORD_FORMAT ||
    !Array.isArray(file.entries)
  )
    throw new Bad('This file is not a Vlo authorship record.', null);
  if (file.version !== RECORD_VERSION)
    throw new Bad('This record has a version that this check does not know.', null);
  if (file.entries.length === 0) throw new Bad('This record has no entries.', null);

  const chains = new Map<string, Chain>();
  const totals = { minutes: 0, typed: 0, pasted: 0, dictated: 0, ai: 0, deleted: 0 };
  let first = Infinity;
  let last = -Infinity;
  let words = 0;
  const read: RecordEntry[] = [];
  for (const [index, value] of file.entries.entries()) {
    const n = index + 1;
    const e = readEntry(value, n);
    read.push(e);
    let chain = chains.get(e.device);
    if (e.key) {
      if (chain) throw new Bad('A device starts a second chain here.', n);
      if ((await sha256Hex(keyText(e.key))) !== e.device)
        throw new Bad('The device key does not match the device of this entry.', n);
      try {
        chain = { key: await importKey(e.key, 'verify'), next: 0, prev: '', entries: 0 };
      } catch {
        throw new Bad('This entry has a device key that does not work.', n);
      }
      chains.set(e.device, chain);
    }
    if (!chain) throw new Bad('This entry comes before the first entry of its device.', n);
    if (e.seq !== chain.next) throw new Bad('An entry is missing or out of order before this one.', n);
    if (e.prev !== chain.prev) throw new Bad('This entry does not link to the entry before it.', n);
    const text = entryText(e);
    if ((await sha256Hex(text)) !== e.hash) throw new Bad('This entry changed after Vlo signed it.', n);
    if (!(await crypto.subtle.verify(SIGN, chain.key, fromHex(e.sig), new TextEncoder().encode(text))))
      throw new Bad('The signature of this entry does not match its device key.', n);
    chain.next += 1;
    chain.prev = e.hash;
    chain.entries += 1;
    totals.minutes += e.minutes;
    for (const source of SOURCES) totals[source] += e[source];
    first = Math.min(first, e.at);
    if (e.at >= last) {
      last = e.at;
      words = e.words;
    }
  }
  // A space, a number such as -0 or a key out of order keeps each value, so the bytes must match too.
  if (recordFile(read) !== json)
    throw new Bad('This file is not in the exact form that Vlo writes, so a byte changed.', null);
  return {
    ok: true,
    devices: [...chains].map(([device, chain]) => ({
      fingerprint: device.slice(0, 16),
      entries: chain.entries,
    })),
    totals,
    first,
    last,
    words,
  };
}

/** Checks a record file: each hash, each signature and each link of each device's chain. */
export async function verifyRecord(json: string): Promise<VerifyResult> {
  try {
    return await check(json);
  } catch (error) {
    if (error instanceof Bad) return { ok: false, reason: error.message, entry: error.entry };
    throw error;
  }
}
