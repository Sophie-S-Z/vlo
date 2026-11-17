/*
 * The comment mark (F43) and its thread (Phase 19, Task C1), with no editor code, so the export worker can
 * read it too. The mark holds the first message in `text`, `by` and `at`, and the answers in `replies`. A
 * comment from before Phase 19 is a thread with no replies.
 */
export const COMMENT = 'comment';

/** An answer in a comment's thread. */
export interface CommentReply {
  id: string;
  text: string;
  /** Who wrote it, such as a reader. Empty for the writer. */
  by: string;
  at: number;
}

/** The replies of a comment mark. A mark from another device or a file can hold anything, so each field is checked. */
export function repliesOf(value: unknown): CommentReply[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((reply: unknown): CommentReply[] => {
    if (typeof reply !== 'object' || reply === null) return [];
    const { id, text, by, at } = reply as Record<string, unknown>;
    if (typeof id !== 'string' || typeof text !== 'string' || text.trim() === '') return [];
    const time = Number(at);
    return [{ id, text, by: typeof by === 'string' ? by : '', at: Number.isFinite(time) ? time : 0 }];
  });
}
