import { Mark, type Editor } from '@tiptap/core';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import { Plugin, PluginKey, TextSelection, type EditorState, type Transaction } from '@tiptap/pm/state';
import { clock } from '@/lib/clock';
import { newId } from '@/lib/ids';
import { openPanel } from '../commands/editorBus';

/*
 * Comments in the text (roadmap F43, plan Task H3). A comment is a mark on the words that holds the
 * comment itself, so the save, tab sync, snapshots, backups and imports carry it with no table of its own.
 * The export reader knows no comment mark, so no export, share or AI request holds a comment. A copy of the
 * words takes no comment: the mark has no HTML parse rule, so a comment never leaves Vlo on the clipboard.
 */

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    comment: {
      /** Puts a new comment on the selected words. False when no words are selected or one has a comment. */
      addComment: (text: string) => ReturnType;
      /** Changes the text of a comment. */
      setCommentText: (id: string, text: string) => ReturnType;
      /** Takes a comment off its words. */
      removeComment: (id: string) => ReturnType;
    };
  }
}

export const COMMENT = 'comment';

export interface CommentEntry {
  id: string;
  text: string;
  /** When the writer made the comment, in milliseconds. */
  at: number;
  /** The start of its first words and the end of its last words. */
  from: number;
  to: number;
  /** The words the comment is on. */
  quote: string;
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
      byId.set(id, {
        id,
        text: String(mark.attrs.text),
        at: Number.isFinite(at) ? at : 0,
        from: pos,
        to: end,
        quote: node.text ?? '',
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

/** Each range of a comment, with its mark. */
function rangesOf(doc: ProseMirrorNode, id: string): { from: number; to: number; attrs: object }[] {
  const out: { from: number; to: number; attrs: object }[] = [];
  doc.descendants((node, pos) => {
    if (!node.isText) return true;
    const mark = node.marks.find((m) => m.type.name === COMMENT && m.attrs.id === id);
    if (mark) out.push({ from: pos, to: pos + node.nodeSize, attrs: mark.attrs });
    return false;
  });
  return out;
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
        (id, text) =>
        ({ state, tr, dispatch }) => {
          const ranges = rangesOf(state.doc, id);
          if (ranges.length === 0 || text.trim() === '') return false;
          // A mark of the same type replaces the old one, so each range keeps one comment.
          if (dispatch)
            for (const r of ranges)
              tr.addMark(r.from, r.to, this.type.create({ ...r.attrs, text: text.trim() }));
          return true;
        },
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
        openPanel({ editor, panel: 'comment', anchor: 'caret' });
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
