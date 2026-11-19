import { Mark, type Editor } from '@tiptap/core';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import { Plugin, PluginKey, TextSelection, type EditorState, type Transaction } from '@tiptap/pm/state';
import { clock } from '@/lib/clock';
import { newId } from '@/lib/ids';
import { openPanel, showCommentCard } from '../commands/editorBus';
import { COMMENT, repliesOf, type CommentReply } from '../format/comment';

/*
 * Comments in the text (roadmap F43, plan Task H3) with replies (Phase 19, Task C1). A comment is a mark on
 * the words that holds the whole thread, so the save, tab sync, snapshots, backups and imports carry it with
 * no table of its own, and Undo takes back each change to it. Resolve keeps the thread on its words with a
 * time, so Reopen can put it back while the words are there. Only a Word export with comments reads the
 * mark, so no other export, share or AI request holds a comment. A copy of the words takes no comment: the
 * mark has no HTML parse rule, so a comment never leaves Vlo on the clipboard.
 */

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    comment: {
      /** Puts a new comment on the selected words. False when no words are selected or one has a comment. */
      addComment: (text: string) => ReturnType;
      /** Changes the text of a comment, or of one of its replies. */
      setCommentText: (id: string, text: string, replyId?: string) => ReturnType;
      /** Adds the writer's answer to a comment's thread. */
      replyToComment: (id: string, text: string) => ReturnType;
      /** Deletes one reply of a comment. */
      removeReply: (id: string, replyId: string) => ReturnType;
      /** Marks a comment as done. It stays on its words, out of sight, until Reopen. */
      resolveComment: (id: string) => ReturnType;
      reopenComment: (id: string) => ReturnType;
      /** Takes a comment and its replies off its words. */
      removeComment: (id: string) => ReturnType;
    };
  }
}

export { COMMENT };

export interface CommentEntry {
  id: string;
  text: string;
  /** Who wrote it, such as an editor or a beta reader. Empty for the writer. */
  by: string;
  /** When the writer made the comment, in milliseconds. */
  at: number;
  /** The start of its first words and the end of its last words. */
  from: number;
  to: number;
  /** The words the comment is on. */
  quote: string;
  replies: readonly CommentReply[];
  /** When the writer resolved it, or 0 while it is open. */
  resolvedAt: number;
}

/** The comments of a document, in the order of their first words. */
function collect(doc: ProseMirrorNode): CommentEntry[] {
  const byId = new Map<string, CommentEntry>();
  doc.descendants((node, pos) => {
    if (!node.isText) return true;
    const mark = node.marks.find((m) => m.type.name === COMMENT);
    if (!mark) return false;
    const id = String(mark.attrs.id);
    const end = pos + node.nodeSize;
    const entry = byId.get(id);
    if (entry) {
      entry.quote += (pos > entry.to ? ' ' : '') + (node.text ?? '');
      entry.to = end;
    } else {
      const at = Number(mark.attrs.at);
      const resolvedAt = Number(mark.attrs.resolvedAt);
      byId.set(id, {
        id,
        text: String(mark.attrs.text),
        by: String(mark.attrs.by ?? ''),
        at: Number.isFinite(at) ? at : 0,
        from: pos,
        to: end,
        quote: node.text ?? '',
        replies: repliesOf(mark.attrs.replies),
        resolvedAt: Number.isFinite(resolvedAt) ? resolvedAt : 0,
      });
    }
    return false;
  });
  return [...byId.values()];
}

const commentKey = new PluginKey<CommentEntry[]>('comments');

/** The comments of the document, in text order. */
export function commentsOf(state: EditorState): readonly CommentEntry[] {
  return commentKey.getState(state) ?? [];
}

/** The comment at the cursor or on the first selected words, or null. */
export function commentAt(state: EditorState): CommentEntry | null {
  const { from, to } = state.selection;
  const end = Math.min(state.doc.content.size, Math.max(to, from + 1));
  let id: string | null = null;
  state.doc.nodesBetween(from, end, (node) => {
    if (id !== null) return false;
    const mark = node.marks.find((m) => m.type.name === COMMENT);
    if (mark) id = String(mark.attrs.id);
    return id === null;
  });
  return commentsOf(state).find((c) => c.id === id) ?? null;
}

interface Range {
  from: number;
  to: number;
  attrs: Record<string, unknown>;
}

/** Each range of a comment, with its mark. */
function rangesOf(doc: ProseMirrorNode, id: string): Range[] {
  const out: Range[] = [];
  doc.descendants((node, pos) => {
    if (!node.isText) return true;
    const mark = node.marks.find((m) => m.type.name === COMMENT && m.attrs.id === id);
    if (mark) out.push({ from: pos, to: pos + node.nodeSize, attrs: mark.attrs });
    return false;
  });
  return out;
}

/**
 * Puts a new version of a comment's mark on each of its ranges, in `tr` when given. `change` gives the new
 * attributes, or null when nothing changes. False when the comment is not in the document.
 */
function changeThread(
  doc: ProseMirrorNode,
  id: string,
  change: (attrs: Record<string, unknown>) => Record<string, unknown> | null,
  tr: Transaction | null,
): boolean {
  const ranges = rangesOf(doc, id);
  const first = ranges[0];
  const type = doc.type.schema.marks[COMMENT];
  if (!first || !type) return false;
  const attrs = change(first.attrs);
  if (!attrs) return false;
  // A mark of the same type replaces the old one, so each range keeps one comment.
  if (tr) for (const r of ranges) tr.addMark(r.from, r.to, type.create(attrs));
  return true;
}

/** Selects a comment's first words, so its panel can open on them. */
export function selectComment(editor: Editor, id: string): boolean {
  const entry = commentsOf(editor.state).find((c) => c.id === id);
  if (!entry) return false;
  const first = rangesOf(editor.state.doc, id)[0];
  if (!first) return false;
  editor.view.dispatch(
    editor.state.tr
      .setSelection(TextSelection.create(editor.state.doc, first.from, first.to))
      .scrollIntoView(),
  );
  return true;
}

export const CommentMark = Mark.create({
  name: COMMENT,
  // Words typed at either end of the comment are not part of it.
  inclusive: false,

  addAttributes() {
    return {
      id: { default: '', renderHTML: (attrs: { id: string }) => ({ 'data-comment-id': attrs.id }) },
      text: { default: '', rendered: false },
      at: { default: 0, rendered: false },
      by: { default: '', rendered: false },
      replies: { default: [], rendered: false },
      resolvedAt: {
        default: 0,
        renderHTML: (attrs: { resolvedAt: number }) => (attrs.resolvedAt > 0 ? { 'data-resolved': '' } : {}),
      },
    };
  },

  parseHTML() {
    return [];
  },

  renderHTML({ HTMLAttributes }) {
    return ['span', { ...HTMLAttributes, class: 'vlo-comment' }, 0];
  },

  addCommands() {
    return {
      addComment:
        (text) =>
        ({ state, tr, dispatch }) => {
          const { from, to, empty } = state.selection;
          const clean = text.trim();
          if (empty || clean === '' || state.doc.rangeHasMark(from, to, this.type)) return false;
          if (dispatch) tr.addMark(from, to, this.type.create({ id: newId(), text: clean, at: clock.now() }));
          return true;
        },
      setCommentText:
        (id, text, replyId) =>
        ({ state, tr, dispatch }) => {
          const clean = text.trim();
          if (clean === '') return false;
          const change = (attrs: Record<string, unknown>) => {
            if (replyId === undefined) return { ...attrs, text: clean };
            const replies = repliesOf(attrs.replies);
            if (!replies.some((r) => r.id === replyId)) return null;
            return { ...attrs, replies: replies.map((r) => (r.id === replyId ? { ...r, text: clean } : r)) };
          };
          return changeThread(state.doc, id, change, dispatch ? tr : null);
        },
      replyToComment:
        (id, text) =>
        ({ state, tr, dispatch }) => {
          const clean = text.trim();
          if (clean === '') return false;
          const reply: CommentReply = { id: newId(), text: clean, by: '', at: clock.now() };
          const change = (attrs: Record<string, unknown>) => ({
            ...attrs,
            replies: [...repliesOf(attrs.replies), reply],
          });
          return changeThread(state.doc, id, change, dispatch ? tr : null);
        },
      removeReply:
        (id, replyId) =>
        ({ state, tr, dispatch }) => {
          const change = (attrs: Record<string, unknown>) => {
            const replies = repliesOf(attrs.replies);
            const kept = replies.filter((r) => r.id !== replyId);
            return kept.length === replies.length ? null : { ...attrs, replies: kept };
          };
          return changeThread(state.doc, id, change, dispatch ? tr : null);
        },
      resolveComment:
        (id) =>
        ({ state, tr, dispatch }) =>
          changeThread(
            state.doc,
            id,
            (attrs) => ({ ...attrs, resolvedAt: clock.now() }),
            dispatch ? tr : null,
          ),
      reopenComment:
        (id) =>
        ({ state, tr, dispatch }) =>
          changeThread(state.doc, id, (attrs) => ({ ...attrs, resolvedAt: 0 }), dispatch ? tr : null),
      removeComment:
        (id) =>
        ({ state, tr, dispatch }) => {
          const ranges = rangesOf(state.doc, id);
          if (ranges.length === 0) return false;
          if (dispatch) for (const r of ranges) tr.removeMark(r.from, r.to, this.type);
          return true;
        },
    };
  },

  addKeyboardShortcuts() {
    return {
      'Mod-Alt-m': ({ editor }) => {
        if (!showCommentCard(editor)) openPanel({ editor, panel: 'comment', anchor: 'caret' });
        return true;
      },
      'Mod-Alt-Shift-a': ({ editor }) => {
        openPanel({ editor, panel: 'comments', anchor: 'caret' });
        return true;
      },
    };
  },

  addProseMirrorPlugins() {
    return [
      new Plugin<CommentEntry[]>({
        key: commentKey,
        state: {
          init: (_, state) => collect(state.doc),
          apply: (tr: Transaction, old) => (tr.docChanged ? collect(tr.doc) : old),
        },
      }),
    ];
  },
});
