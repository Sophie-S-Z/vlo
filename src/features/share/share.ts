import { flattenTree } from '@/features/binder/tree';
import type { ExportScope } from '@/features/export/build';
import { mathmlFor } from '@/features/export/latex';
import { safeExportTree } from '@/features/export/safeTree';
import { hasTemplate, holdsText } from '@/features/library/templates';
import { clock } from '@/lib/clock';
import { newOwnerToken, newShareKey, sealJson } from '@/lib/crypto';
import { db, type Item, type Project, type ShareRecord } from '@/lib/db';
import type { NameCheck, PrivatePerson } from '@/lib/privacy';
import { readItemUpdates } from '@/lib/ydocs';
import { toBundle, type ShareBundle } from './bundle';
import { refreshComments } from './comments';
import { rpc, ShareError } from './rpc';
import { shareState } from './state';

export { shareState, type ShareState } from './state';

/*
 * Share links (spec section 11, plan Task E3). The writer picks items and an expiry. Vlo builds the share
 * bundle from the export tree (aliased for a memoir), seals it with a new key, and sends only the cipher
 * text, its IV, a new owner token and the days. The key goes in the link fragment, which a browser never
 * sends. The key and the owner token stay in this device's share record.
 */

export const EXPIRY_DAYS = [1, 7, 14, 30] as const;
export type ExpiryDays = (typeof EXPIRY_DAYS)[number];

/** The largest payload that create_share takes, in base64 characters. */
export const MAX_PAYLOAD = 2_800_000;

const DAY_MS = 86_400_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface ShareInput {
  project: Pick<Project, 'title' | 'templates' | 'authorName' | 'settings'>;
  items: readonly Item[];
  /** The items to share. Vlo puts them in binder order. */
  itemIds: readonly string[];
  people: readonly PrivatePerson[];
}

export interface PreparedShare {
  bundle: ShareBundle;
  /** The shared items, in binder order. */
  itemIds: string[];
  /** For a memoir, the unmarked and changed private names, read before the aliases go in. */
  names: NameCheck;
}

/** The items that a link can hold: each item with text, in binder order. */
export function shareableItems(templates: Project['templates'], items: readonly Item[]): Item[] {
  return flattenTree(items)
    .map((n) => n.item)
    .filter((item) => holdsText(templates, item.kind));
}

/**
 * Reads the picked items and builds the bundle that the link will hold. A memoir's bundle has each private
 * name as its alias (US06). Nothing leaves the device here.
 */
export async function prepareShare(input: ShareInput): Promise<PreparedShare> {
  const wanted = new Set(input.itemIds);
  const picked = shareableItems(input.project.templates, input.items).filter((item) => wanted.has(item.id));
  const first = picked[0];
  if (!first) throw new RangeError('Pick at least one item to share.');
  const itemIds = picked.map((item) => item.id);
  const scope: ExportScope =
    picked.length === 1 ? { kind: 'item', itemId: first.id } : { kind: 'sequence', name: '', itemIds };
  const { doc, names } = safeExportTree({
    project: input.project,
    items: [...input.items],
    scope,
    updates: await readItemUpdates(itemIds),
    people: [...input.people],
    shareSafe: hasTemplate(input.project, 'memoir'),
  });
  return { bundle: toBundle(doc, await mathmlFor(doc), clock.now()), itemIds, names };
}

/** A size in megabytes with one decimal, such as 2.8. */
function megabytes(chars: number): string {
  return (Math.ceil(chars / 100_000) / 10).toFixed(1);
}

/** Seals the bundle, sends it, and keeps the link's record on this device. */
export async function createShare(
  prepared: PreparedShare,
  projectId: string,
  days: ExpiryDays,
): Promise<ShareRecord> {
  const { key, text } = await newShareKey();
  const sealed = await sealJson(prepared.bundle, key, 'bundle');
  if (sealed.payload.length > MAX_PAYLOAD)
    throw new ShareError(
      'too-large',
      `These items come to ${megabytes(sealed.payload.length)} MB once sealed. A link holds at most ${megabytes(MAX_PAYLOAD)} MB, so pick fewer items.`,
    );
  const ownerToken = newOwnerToken();
  const id = await rpc<unknown>(
    'create_share',
    { p_payload: sealed.payload, p_iv: sealed.iv, p_owner_token: ownerToken, p_days: days },
    'share',
  );
  if (typeof id !== 'string' || !UUID.test(id)) throw new ShareError('server');
  const createdAt = clock.now();
  const record: ShareRecord = {
    id: id.toLowerCase(),
    projectId,
    itemIds: prepared.itemIds,
    title: prepared.bundle.title,
    createdAt,
    expiresAt: createdAt + days * DAY_MS,
    ownerToken,
    key: text,
    revoked: false,
    comments: [],
    commentsReadAt: 0,
  };
  try {
    await db.shares.add(record);
  } catch (problem) {
    // Without its record, the writer could not stop the link. So the link stops at once.
    await rpc('revoke_share', { p_id: record.id, p_owner_token: ownerToken }, 'share').catch(() => undefined);
    throw problem;
  }
  return record;
}

/** The link for readers. The key is in the fragment, after `#k=`. */
export function shareLink(record: Pick<ShareRecord, 'id' | 'key'>, origin = window.location.origin): string {
  return `${origin}/r/${record.id}#k=${record.key}`;
}

/** The project's links, the newest first. */
export async function projectShares(projectId: string): Promise<ShareRecord[]> {
  const records = await db.shares.where('projectId').equals(projectId).toArray();
  return records.sort((a, b) => b.createdAt - a.createdAt);
}

/**
 * Stops a link. Only revoke_share gets the owner token. Vlo reads the link's comments first, because the
 * server gives none after the stop. When the server says no, Vlo asks for the link's state: a link that
 * the server still serves stays active on this device, so the writer never sees a false "Stopped".
 */
export async function revokeShare(id: string): Promise<void> {
  const record = await db.shares.get(id);
  if (!record) return;
  await refreshComments(record).catch(() => undefined);
  const stopped = await rpc<unknown>(
    'revoke_share',
    { p_id: record.id, p_owner_token: record.ownerToken },
    'share',
  );
  if (stopped !== true) {
    const rows = await rpc<unknown>('get_share', { p_id: record.id }, 'share');
    const row: unknown = Array.isArray(rows) ? rows[0] : undefined;
    const status = typeof row === 'object' && row !== null ? (row as { status?: unknown }).status : undefined;
    if (status === 'ok') throw new ShareError('server');
  }
  await db.shares.update(id, { revoked: true });
}

/** Removes an expired or stopped link from this device. An active link must stop first. */
export async function removeShare(id: string): Promise<void> {
  const record = await db.shares.get(id);
  if (!record) return;
  if (shareState(record) === 'active') throw new RangeError('Stop sharing this link first.');
  await db.shares.delete(id);
}
