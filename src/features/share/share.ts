import { flattenTree } from '@/features/binder/tree';
import type { ExportScope } from '@/features/export/build';
import { mathmlFor } from '@/features/export/latex';
import { safeExportTree } from '@/features/export/safeTree';
import { hasTemplate, holdsText } from '@/features/library/templates';
import { clock } from '@/lib/clock';
import { newOwnerToken, newShareKey, sealBytes, sealJson } from '@/lib/crypto';
import { db, type Item, type Project, type ShareRecord, type Source } from '@/lib/db';
import type { NameCheck, PrivatePerson } from '@/lib/privacy';
import { readItemUpdates } from '@/lib/ydocs';
import { readImages } from '@/features/images/images';
import { imageNames, type ExportImage } from '@/features/export/model';
import { prepareImage } from '@/features/images/resize';
import { MAX_SHARE_IMAGES, toBundle, type ShareBundle, type SharedImages } from './bundle';
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

/** The long side of an image in a link, in pixels (decision G6). */
export const SHARE_IMAGE_SIDE = 1600;

/** The most that a link's text and images come to once sealed, in base64 characters: 20 MB of bytes. */
export const MAX_SHARE_TOTAL = 26_666_666;

const DAY_MS = 86_400_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface ShareInput {
  project: Pick<Project, 'title' | 'templates' | 'authorName' | 'settings'>;
  items: readonly Item[];
  /** The items to share. Vlo puts them in binder order. */
  itemIds: readonly string[];
  people: readonly PrivatePerson[];
  /** The project's sources, for the citations and the reference list (F64). */
  sources: readonly Source[];
  /** The writer's questions for the readers. Empty questions stay out. */
  questions?: readonly string[];
}

export interface PreparedShare {
  bundle: ShareBundle;
  /** The shared items, in binder order. */
  itemIds: string[];
  /** For a memoir, the unmarked and changed private names, read before the aliases go in. */
  names: NameCheck;
  /** The bytes of each image that goes with the link, by its number in the bundle. */
  images?: ExportImage[];
}

/**
 * The most bytes of one image in a link. Sealed, it stays under the 2,800,000 characters that
 * add_share_image takes.
 */
export const MAX_SHARE_IMAGE_BYTES = 2_000_000;

/** The long sides that Vlo tries for an image that is too large for a link, the largest first. */
const SHARE_SIDES = [SHARE_IMAGE_SIDE, 1200, 800] as const;

/**
 * An image at most SHARE_IMAGE_SIDE pixels on its long side and MAX_SHARE_IMAGE_BYTES in size. A smaller
 * one stays as Vlo stored it. An image that is still too large at 800 pixels gives null, and the link
 * shows its stand-in line.
 */
export async function shareCopy(image: ExportImage): Promise<ExportImage | null> {
  if (
    Math.max(image.width, image.height) <= SHARE_IMAGE_SIDE &&
    image.data.byteLength <= MAX_SHARE_IMAGE_BYTES
  )
    return image;
  const blob = new Blob([new Uint8Array(image.data)], { type: image.type });
  for (const side of SHARE_SIDES) {
    const smaller = await prepareImage(blob, side);
    if (smaller.data.size <= MAX_SHARE_IMAGE_BYTES)
      return {
        type: smaller.type,
        width: smaller.width,
        height: smaller.height,
        data: new Uint8Array(await smaller.data.arrayBuffer()),
      };
  }
  return null;
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
  const updates = await readItemUpdates(itemIds);
  const { doc, names } = safeExportTree({
    project: input.project,
    items: [...input.items],
    scope,
    updates,
    images: await readImages(updates),
    people: [...input.people],
    sources: input.sources,
    shareSafe: hasTemplate(input.project, 'memoir'),
  });
  const questions = (input.questions ?? []).map((q) => q.trim()).filter((q) => q !== '');
  // Each image on this device goes with the link as a file of its own, in reading order (decision G6).
  const shared = new Map<string, { n: number; width: number; height: number }>();
  const images: ExportImage[] = [];
  for (const [id] of imageNames(doc)) {
    const stored = doc.images?.[id];
    if (!stored || images.length >= MAX_SHARE_IMAGES) continue;
    const copy = await shareCopy(stored);
    if (!copy) continue;
    shared.set(id, { n: images.length, width: copy.width, height: copy.height });
    images.push(copy);
  }
  const bundle = toBundle(doc, await mathmlFor(doc), clock.now(), shared satisfies SharedImages);
  return { bundle: questions.length > 0 ? { ...bundle, questions } : bundle, itemIds, names, images };
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
  // Each image is sealed with the link's key, so the server never sees its bytes.
  const images = await Promise.all(
    (prepared.images ?? []).map((image, n) => sealBytes(image.data, key, 'image', String(n))),
  );
  const total = images.reduce((sum, image) => sum + image.payload.length, sealed.payload.length);
  if (total > MAX_SHARE_TOTAL)
    throw new ShareError(
      'too-large',
      `These items and their images come to ${megabytes((total * 3) / 4)} MB once sealed. A link holds at most 20.0 MB, so pick fewer items.`,
    );
  const ownerToken = newOwnerToken();
  const id = await rpc<unknown>(
    'create_share',
    { p_payload: sealed.payload, p_iv: sealed.iv, p_owner_token: ownerToken, p_days: days },
    'share',
  );
  if (typeof id !== 'string' || !UUID.test(id)) throw new ShareError('server');
  try {
    for (const [n, image] of images.entries())
      await rpc(
        'add_share_image',
        { p_id: id, p_owner_token: ownerToken, p_n: n, p_payload: image.payload, p_iv: image.iv },
        'share',
      );
  } catch (problem) {
    // A link with only some of its images would show gaps, so it stops at once.
    await rpc('revoke_share', { p_id: id, p_owner_token: ownerToken }, 'share').catch(() => undefined);
    throw problem;
  }
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
    ...(prepared.bundle.questions ? { questions: prepared.bundle.questions } : {}),
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
