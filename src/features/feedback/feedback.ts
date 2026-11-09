import { Transform } from '@tiptap/pm/transform';
import { flattenTree } from '@/features/binder/tree';
import { findWords } from '@/features/editor/extensions/findReplace';
import { COMMENT } from '@/features/editor/format/comment';
import { changeStoredDoc, type StoredTarget } from '@/features/editor/storedDoc';
import { REACTION_LABELS } from '@/features/share/comments';
import type { Item, ShareRecord, StoredComment } from '@/lib/db';
import { newId } from '@/lib/ids';

/*
 * The Feedback tab (F50, decision R4): the replies of every link of a project, by item. A reply on words
 * can become a comment in the text, with the reader's name.
 */

export interface FeedbackReply {
  share: ShareRecord;
  comment: StoredComment;
}

export interface FeedbackGroup {
  /** The item of the replies, or null for the answers to the links' questions. */
  itemId: string | null;
  replies: FeedbackReply[];
}

/**
 * The replies by item, in binder order, oldest first. An item that the project no longer has comes after
 * the binder, and the answers come last.
 */
export function feedbackOf(shares: readonly ShareRecord[], items: readonly Item[]): FeedbackGroup[] {
  const order = new Map(flattenTree(items).map((node, i) => [node.item.id, i]));
  const groups = new Map<string | null, FeedbackReply[]>();
  for (const share of shares) {
    for (const comment of share.comments) {
      // Each section of a link is one of its items, in order.
      const itemId = comment.question !== undefined ? null : share.itemIds[comment.section];
      if (itemId === undefined) continue;
      groups.set(itemId, [...(groups.get(itemId) ?? []), { share, comment }]);
    }
  }
  const rank = (id: string | null) => (id === null ? order.size + 1 : (order.get(id) ?? order.size));
  return [...groups]
    .map(([itemId, replies]) => ({
      itemId,
      replies: replies.sort((a, b) => a.comment.at - b.comment.at),
    }))
    .sort((a, b) => rank(a.itemId) - rank(b.itemId));
}

/** The text of the comment that a reply becomes: its reaction, then its words. */
export function commentText(reply: StoredComment): string {
  return [reply.reaction ? REACTION_LABELS[reply.reaction] : '', reply.text]
    .filter((t) => t !== '')
    .join('\n');
}

export type MadeComment = 'made' | 'missing' | 'taken' | 'newer';

/**
 * Puts the reply as a comment on its words in the item's stored text, with the reader's name as `by`.
 * "missing" when the text no longer has the words, "taken" when they already have a comment, and "newer"
 * when a newer Vlo saved the item.
 */
export async function makeComment(target: StoredTarget, reply: StoredComment): Promise<MadeComment> {
  let result: MadeComment = 'newer';
  const made = await changeStoredDoc(target, (doc) => {
    const tr = new Transform(doc);
    const mark = doc.type.schema.marks[COMMENT];
    const at = findWords(doc, reply.quote);
    result = 'missing';
    if (!mark || !at) return tr;
    result = 'taken';
    if (doc.rangeHasMark(at.from, at.to, mark)) return tr;
    return tr.addMark(
      at.from,
      at.to,
      mark.create({ id: newId(), text: commentText(reply), at: reply.at, by: reply.name ?? 'A reader' }),
    );
  });
  return made ? 'made' : result;
}
