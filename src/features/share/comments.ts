import { openJson, sealJson, importShareKey } from '@/lib/crypto';
import { db, type ShareRecord, type StoredComment } from '@/lib/db';
import { clock } from '@/lib/clock';
import { MAX_QUOTE } from './bundle';
import { rpc } from './rpc';

/*
 * Reader comments (spec section 11, plan decisions S4 and R4). A reader's comment names one block of the
 * bundle. Version 1 holds the block's first 12 words, so the writer sees the place after the text changes.
 * Version 2 (F50) can hold the selected words with their offsets in the block's text, a reaction, or an
 * answer to one of the writer's questions. The reader's browser seals it with the link's key, so the
 * server holds cipher text only. Anyone with the link can send a comment, so `parseComment` checks every
 * field before any screen shows it.
 */

/** A reader's reaction. The type comes from the stored comment, so this file and the database agree. */
export type Reaction = NonNullable<StoredComment['reaction']>;
export const REACTIONS = [
  'loved',
  'funny',
  'moved',
  'lost',
  'bored',
  'unconvinced',
] as const satisfies readonly Reaction[];

export const REACTION_LABELS: Record<Reaction, string> = {
  loved: 'Loved it',
  funny: 'Funny',
  moved: 'Moved me',
  lost: 'Lost',
  bored: 'Bored',
  unconvinced: 'Not convinced',
};

export interface ReaderComment {
  v: 1 | 2;
  /** The section and block of the bundle that the comment is about. */
  section: number;
  block: number;
  /** The block's first 12 words, or the selected words when `start` and `end` are set. */
  quote: string;
  /** The offsets of the selected words in the block's text (`textOfBlock`). Version 2 only. */
  start?: number;
  end?: number;
  reaction?: Reaction;
  /** The index of the writer's question that `text` answers. Version 2 only. */
  question?: number;
  name?: string;
  /** The comment, or the answer. A version 2 comment with a reaction can have no text. */
  text: string;
  /** When the reader sent it, in milliseconds, by the reader's clock. */
  at: number;
}

export const MAX_COMMENT = 2000;
export const MAX_NAME = 80;

/** The most comments that a link holds, as add_comment counts them. */
export const MAX_COMMENTS = 500;

/**
 * What the check knows about the link: the number of its questions, and on the reader's device the text
 * of each block. The writer's device keeps no bundle, so there the selected words only need to fit their
 * offsets.
 */
export interface CommentLimits {
  questions: number;
  blocks?: readonly (readonly string[])[];
}

const isIndex = (v: unknown): v is number =>
  typeof v === 'number' && Number.isInteger(v) && v >= 0 && v < 100_000;

const isReaction = (v: unknown): v is Reaction => REACTIONS.includes(v as Reaction);

/** The comment, checked field by field, or null for anything that Vlo does not make. */
export function parseComment(value: unknown, limits: CommentLimits): ReaderComment | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  if ((v.v !== 1 && v.v !== 2) || !isIndex(v.section) || !isIndex(v.block)) return null;
  if (typeof v.quote !== 'string' || v.quote.length > MAX_QUOTE) return null;
  if (typeof v.text !== 'string' || v.text.length > MAX_COMMENT) return null;
  if (typeof v.at !== 'number' || !Number.isFinite(v.at)) return null;
  if (v.name !== undefined && (typeof v.name !== 'string' || v.name.length > MAX_NAME)) return null;
  const extra: Pick<ReaderComment, 'start' | 'end' | 'reaction' | 'question'> = {};
  if (v.v === 2) {
    if (v.reaction !== undefined) {
      if (!isReaction(v.reaction)) return null;
      extra.reaction = v.reaction;
    }
    if (v.start !== undefined || v.end !== undefined) {
      if (!isIndex(v.start) || !isIndex(v.end) || v.start >= v.end) return null;
      // The quote is the selected words, so it has their length, and their text when the block is known.
      if (v.end - v.start !== v.quote.length) return null;
      const text = limits.blocks?.[v.section]?.[v.block];
      if (limits.blocks && text?.slice(v.start, v.end) !== v.quote) return null;
      extra.start = v.start;
      extra.end = v.end;
    }
    if (v.question !== undefined) {
      // An answer is about a question, not about words of the text.
      if (!isIndex(v.question) || v.question >= limits.questions) return null;
      if (extra.reaction !== undefined || extra.start !== undefined) return null;
      extra.question = v.question;
    }
  }
  if (v.text.trim() === '' && extra.reaction === undefined) return null;
  const name = typeof v.name === 'string' ? v.name.trim() : '';
  return {
    v: v.v,
    section: v.section,
    block: v.block,
    quote: v.quote,
    ...extra,
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
export async function readComments(
  shareId: string,
  key: CryptoKey,
  limits: CommentLimits,
): Promise<ListedComment[]> {
  const rows = await rpc<unknown>('list_comments', { p_share_id: shareId }, 'share');
  if (!Array.isArray(rows)) return [];
  const out: ListedComment[] = [];
  for (const row of rows as CommentRow[]) {
    if (typeof row !== 'object' || typeof row.payload !== 'string' || typeof row.iv !== 'string') continue;
    if (typeof row.id !== 'string') continue;
    let comment: ReaderComment | null = null;
    try {
      comment = parseComment(await openJson({ payload: row.payload, iv: row.iv }, key, 'comment'), limits);
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
  const sealed = await sealJson(comment, key, 'comment');
  const id = await rpc<unknown>(
    'add_comment',
    { p_share_id: shareId, p_payload: sealed.payload, p_iv: sealed.iv },
    'share',
  );
  return typeof id === 'string' ? id : '';
}

/** Reads the comments of the writer's link and keeps them in its record on this device. */
export async function refreshComments(record: ShareRecord): Promise<StoredComment[]> {
  const listed = await readComments(record.id, await importShareKey(record.key), {
    questions: record.questions?.length ?? 0,
  });
  const comments: StoredComment[] = listed.map(({ id, comment: c, at }) => ({
    id,
    section: c.section,
    block: c.block,
    quote: c.quote,
    ...(c.start !== undefined && c.end !== undefined ? { start: c.start, end: c.end } : {}),
    ...(c.reaction ? { reaction: c.reaction } : {}),
    ...(c.question !== undefined ? { question: c.question } : {}),
    ...(c.name ? { name: c.name } : {}),
    text: c.text,
    at,
  }));
  await db.shares.update(record.id, { comments, commentsReadAt: clock.now() });
  return comments;
}
