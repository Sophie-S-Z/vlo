import { openJson, sealJson, importShareKey } from '@/lib/crypto';
import { db, type ShareRecord, type StoredComment } from '@/lib/db';
import { clock } from '@/lib/clock';
import { rpc } from './rpc';

/*
 * Reader comments (spec section 11, plan decision S4). A reader's comment names one block of the bundle and
 * holds the block's first 12 words, so the writer sees the place after the text changes. The reader's
 * browser seals it with the link's key, so the server holds cipher text only. Anyone with the link can
 * send a comment, so `parseComment` checks every field before any screen shows it.
 */

export interface ReaderComment {
  v: 1;
  /** The section and block of the bundle that the comment is about. */
  section: number;
  block: number;
  quote: string;
  name?: string;
  text: string;
  /** When the reader sent it, in milliseconds, by the reader's clock. */
  at: number;
}

export const MAX_COMMENT = 2000;
export const MAX_NAME = 80;
export const MAX_QUOTE = 200;

/** The most comments that a link holds, as add_comment counts them. */
export const MAX_COMMENTS = 500;

const isIndex = (v: unknown): v is number =>
  typeof v === 'number' && Number.isInteger(v) && v >= 0 && v < 100_000;

/** The comment, checked field by field, or null for anything that Vlo does not make. */
export function parseComment(value: unknown): ReaderComment | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  if (v.v !== 1 || !isIndex(v.section) || !isIndex(v.block)) return null;
  if (typeof v.quote !== 'string' || v.quote.length > MAX_QUOTE) return null;
  if (typeof v.text !== 'string' || v.text.trim() === '' || v.text.length > MAX_COMMENT) return null;
  if (typeof v.at !== 'number' || !Number.isFinite(v.at)) return null;
  if (v.name !== undefined && (typeof v.name !== 'string' || v.name.length > MAX_NAME)) return null;
  const name = typeof v.name === 'string' ? v.name.trim() : '';
  return {
    v: 1,
    section: v.section,
    block: v.block,
    quote: v.quote,
    ...(name !== '' ? { name } : {}),
    text: v.text,
    at: v.at,
  };
}

export interface ListedComment {
  id: string;
  comment: ReaderComment;
  /** When the server took it, in milliseconds. */
  at: number;
}

interface CommentRow {
  id: unknown;
  payload: unknown;
  iv: unknown;
  created_at: unknown;
}

/** The comments of a link that open with its key and pass the check, oldest first. Others are left out. */
export async function readComments(shareId: string, key: CryptoKey): Promise<ListedComment[]> {
  const rows = await rpc<unknown>('list_comments', { p_share_id: shareId }, 'share');
  if (!Array.isArray(rows)) return [];
  const out: ListedComment[] = [];
  for (const row of rows as CommentRow[]) {
    if (typeof row !== 'object' || typeof row.payload !== 'string' || typeof row.iv !== 'string') continue;
    if (typeof row.id !== 'string') continue;
    let comment: ReaderComment | null = null;
    try {
      comment = parseComment(await openJson({ payload: row.payload, iv: row.iv }, key));
    } catch {
      comment = null;
    }
    if (!comment) continue;
    const at = typeof row.created_at === 'string' ? Date.parse(row.created_at) : NaN;
    out.push({ id: row.id, comment, at: Number.isFinite(at) ? at : comment.at });
  }
  return out.sort((a, b) => a.at - b.at);
}

/** Seals the comment with the link's key and sends it. Gives the server's id. */
export async function sendComment(shareId: string, key: CryptoKey, comment: ReaderComment): Promise<string> {
  const sealed = await sealJson(comment, key);
  const id = await rpc<unknown>(
    'add_comment',
    { p_share_id: shareId, p_payload: sealed.payload, p_iv: sealed.iv },
    'share',
  );
  return typeof id === 'string' ? id : '';
}

/** Reads the comments of the writer's link and keeps them in its record on this device. */
export async function refreshComments(record: ShareRecord): Promise<StoredComment[]> {
  const listed = await readComments(record.id, await importShareKey(record.key));
  const comments: StoredComment[] = listed.map(({ id, comment, at }) => ({
    id,
    section: comment.section,
    block: comment.block,
    quote: comment.quote,
    ...(comment.name ? { name: comment.name } : {}),
    text: comment.text,
    at,
  }));
  await db.shares.update(record.id, { comments, commentsReadAt: clock.now() });
  return comments;
}
