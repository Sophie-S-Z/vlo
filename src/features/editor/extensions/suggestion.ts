import { Mark } from '@tiptap/core';
import {
  Fragment,
  Slice,
  type Mark as ProseMirrorMark,
  type MarkType,
  type Node as ProseMirrorNode,
} from '@tiptap/pm/model';
import { Plugin, PluginKey, TextSelection, type EditorState, type Transaction } from '@tiptap/pm/state';
import { ReplaceStep, type Step } from '@tiptap/pm/transform';
import { ySyncPluginKey } from '@tiptap/y-tiptap';
import { clock } from '@/lib/clock';
import type { Pass } from '@/lib/db';
import { newId } from '@/lib/ids';
import { getTracking } from '../trackingStore';
import { KEEP_AI_MARKS } from './aiOrigin';
import { SKIP_TRACKING, SUGGESTION, type ChangeKind, type SuggestionAttrs } from '../format/suggestion';

export {
  SKIP_TRACKING,
  SUGGESTION,
  acceptedDoc,
  type ChangeKind,
  type SuggestionAttrs,
} from '../format/suggestion';

/*
 * Track changes (roadmap F44, plan Task I1 and decision R1). A suggestion is a mark on the words, as a
 * comment is, so the save, tab sync, snapshots, backups and imports carry it with no table of its own.
 * While tracking is on, a plugin turns each local edit into marks: new words get an insert mark, and
 * deleted words go back in with a delete mark. Formatting, Enter and a join of two paragraphs apply at
 * once. A change from Yjs (another tab, undo, a sync) gets no mark. The mark has no HTML parse rule, so a
 * paste never carries a suggestion.
 */

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    suggestion: {
      acceptChange: (id: string) => ReturnType;
      rejectChange: (id: string) => ReturnType;
      /** Accepts every change, or only the changes of one pass. */
      acceptAll: (pass?: Pass) => ReturnType;
      rejectAll: (pass?: Pass) => ReturnType;
    };
  }
}

export interface ChangeEntry extends SuggestionAttrs {
  /** The start of its first words and the end of its last words. */
  from: number;
  to: number;
  /** The words of the change. */
  text: string;
}

const attrsOf = (mark: ProseMirrorMark): SuggestionAttrs => mark.attrs as SuggestionAttrs;
const suggestionOf = (node: ProseMirrorNode): ProseMirrorMark | undefined =>
  node.marks.find((m) => m.type.name === SUGGESTION);

/** The changes of a document in text order. Read again only after the document changes. */
const changeCache = new WeakMap<ProseMirrorNode, ChangeEntry[]>();

export function changesOf(state: EditorState): readonly ChangeEntry[] {
  const doc = state.doc;
  const cached = changeCache.get(doc);
  if (cached) return cached;
  const byId = new Map<string, ChangeEntry>();
  doc.descendants((node, pos) => {
    if (!node.isInline) return true;
    const mark = suggestionOf(node);
    if (!mark) return false;
    const attrs = attrsOf(mark);
    const text = node.isText ? (node.text ?? '') : '';
    const entry = byId.get(attrs.id);
    if (entry) {
      entry.text += (pos > entry.to ? ' ' : '') + text;
      entry.to = pos + node.nodeSize;
    } else byId.set(attrs.id, { ...attrs, from: pos, to: pos + node.nodeSize, text });
    return false;
  });
  const out = [...byId.values()];
  changeCache.set(doc, out);
  return out;
}

/** The ranges of the given changes, merged where they touch, last first. */
function rangesOf(
  doc: ProseMirrorNode,
  ids: ReadonlySet<string>,
): { from: number; to: number; kind: ChangeKind }[] {
  const out: { from: number; to: number; kind: ChangeKind }[] = [];
  doc.descendants((node, pos) => {
    if (!node.isInline) return true;
    const mark = suggestionOf(node);
    if (mark && ids.has(attrsOf(mark).id)) {
      const last = out[out.length - 1];
      const kind = attrsOf(mark).kind;
      if (last?.to === pos && last.kind === kind) last.to = pos + node.nodeSize;
      else out.push({ from: pos, to: pos + node.nodeSize, kind });
    }
    return false;
  });
  return out.reverse();
}

/**
 * Removes the words from `from` to `to`, and their paragraph or line when they were all of it, so an
 * accepted delete of a whole poem line leaves no empty line, which would start a new stanza.
 */
function removeWords(tr: Transaction, from: number, to: number): void {
  const $from = tr.doc.resolve(from);
  const whole = from === $from.start() && to === $from.end();
  if (whole && $from.node($from.depth - 1).childCount > 1) tr.delete($from.before(), $from.after());
  else tr.delete(from, to);
}

/** Accepts or rejects the given changes in one transaction. Changes nothing without `dispatch`. */
function settle(
  tr: Transaction,
  type: MarkType,
  ids: ReadonlySet<string>,
  accept: boolean,
  dispatch: unknown,
): boolean {
  const ranges = rangesOf(tr.doc, ids);
  if (ranges.length === 0) return false;
  if (!dispatch) return true;
  for (const { from, to, kind } of ranges) {
    // An accepted delete and a rejected insert remove the words. The others keep the words.
    if ((kind === 'delete') === accept) removeWords(tr, from, to);
    else tr.removeMark(from, to, type);
  }
  tr.setMeta(SKIP_TRACKING, true).setMeta(KEEP_AI_MARKS, true);
  return true;
}

const idsOf = (state: EditorState, pass?: Pass) =>
  new Set(
    changesOf(state)
      .filter((c) => pass === undefined || c.pass === pass)
      .map((c) => c.id),
  );

type Op =
  | { kind: 'insert'; from: number; to: number }
  | { kind: 'delete'; at: number; slice: Slice; forward: boolean };

const tracked = (tr: Transaction) =>
  tr.docChanged && tr.getMeta(ySyncPluginKey) === undefined && tr.getMeta(SKIP_TRACKING) === undefined;

function mapOps(ops: readonly Op[], step: Step): Op[] {
  const map = step.getMap();
  return ops.flatMap((op): Op[] => {
    if (op.kind === 'delete') return [{ ...op, at: map.map(op.at, -1) }];
    const from = map.map(op.from, 1);
    const to = map.map(op.to, -1);
    return to > from ? [{ kind: 'insert', from, to }] : [];
  });
}

/** The deleted content to put back: without the words that were a pending insert, and without objects. */
function keptContent(fragment: Fragment, type: MarkType): Fragment {
  const out: ProseMirrorNode[] = [];
  fragment.forEach((node) => {
    const mark = type.isInSet(node.marks);
    if (node.isText) {
      if (!mark || attrsOf(mark).kind === 'delete') out.push(node);
    } else if (!node.isInline) out.push(node.copy(keptContent(node.content, type)));
  });
  return Fragment.from(out);
}

const hasText = (fragment: Fragment) => fragment.textBetween(0, fragment.size) !== '';

/** The edits of the writer's transactions, in the coordinates of the last document. */
function opsOf(
  transactions: readonly Transaction[],
  old: EditorState,
  type: MarkType,
  forwardKey: boolean | null,
): Op[] {
  let ops: Op[] = [];
  for (const tr of transactions) {
    const mine = tracked(tr);
    tr.steps.forEach((step, i) => {
      ops = mapOps(ops, step);
      const before = tr.docs[i];
      if (!mine || !(step instanceof ReplaceStep) || !before) return;
      const { from, to } = step;
      const inserted = step.slice.size;
      if (to > from) {
        const removed = before.slice(from, to);
        const content = keptContent(removed.content, type);
        if (hasText(content)) {
          // The Delete key removes the text after the caret, and Backspace the text before it. With no key,
          // as in a command, an empty selection at the start of the range means a forward delete.
          const forward =
            forwardKey ??
            (tr === transactions[0] && i === 0 && old.selection.empty && old.selection.head === from);
          const slice = new Slice(content, removed.openStart, removed.openEnd);
          ops.push({ kind: 'delete', at: from, slice, forward });
        }
      }
      if (inserted > 0) ops.push({ kind: 'insert', from, to: from + inserted });
    });
  }
  return ops;
}

/** The suggestion next to `pos` on the given side when it has this kind and pass and is the writer's. */
function neighbour(
  doc: ProseMirrorNode,
  pos: number,
  side: -1 | 1,
  kind: ChangeKind,
  pass: Pass,
): SuggestionAttrs | null {
  if (pos < 0 || pos > doc.content.size) return null;
  const $pos = doc.resolve(pos);
  const node = side < 0 ? $pos.nodeBefore : $pos.nodeAfter;
  const mark = node ? suggestionOf(node) : undefined;
  if (!mark) return null;
  const attrs = attrsOf(mark);
  return attrs.kind === kind && attrs.pass === pass && attrs.by === '' ? attrs : null;
}

/** The content with the mark on each text node that has no suggestion yet. */
function marked(fragment: Fragment, type: MarkType, attrs: SuggestionAttrs): Fragment {
  const mark = type.create(attrs);
  const out: ProseMirrorNode[] = [];
  fragment.forEach((node) => {
    if (node.isText) out.push(type.isInSet(node.marks) ? node : node.mark(mark.addToSet(node.marks)));
    else out.push(node.isLeaf ? node : node.copy(marked(node.content, type, attrs)));
  });
  return Fragment.from(out);
}

const markedSlice = (slice: Slice, type: MarkType, attrs: SuggestionAttrs) =>
  new Slice(marked(slice.content, type, attrs), slice.openStart, slice.openEnd);

/*
 * The marks go in as a text replacement, not as an added mark. Yjs keeps its fast path for a text
 * replacement in one paragraph, while an added mark makes it map every character of the document, which
 * took about 100 ms a key in the 10,000-word scene.
 */
function applyOps(state: EditorState, ops: readonly Op[], type: MarkType, pass: Pass): Transaction | null {
  if (ops.length === 0) return null;
  const tr = state.tr;
  const attrsFor = (kind: ChangeKind, from: number, to: number): SuggestionAttrs => {
    const near = neighbour(tr.doc, from, -1, kind, pass) ?? neighbour(tr.doc, to, 1, kind, pass);
    return near ?? { id: newId(), kind, pass, at: clock.now(), by: '' };
  };
  // An insert keeps its size, so the positions of the other edits stay right.
  for (const op of ops)
    if (op.kind === 'insert')
      tr.replace(
        op.from,
        op.to,
        markedSlice(tr.doc.slice(op.from, op.to), type, attrsFor('insert', op.from, op.to)),
      );
  // Each delete goes back in, the last first, so the earlier positions stay right.
  const deletes = ops.filter((op): op is Extract<Op, { kind: 'delete' }> => op.kind === 'delete');
  deletes.sort((a, b) => b.at - a.at);
  let caret: number | null = null;
  for (const op of deletes) {
    const before = tr.doc.content.size;
    tr.replace(op.at, op.at, markedSlice(op.slice, type, attrsFor('delete', op.at, op.at)));
    caret = op.forward ? op.at + tr.doc.content.size - before : op.at;
  }
  // After a pure delete the caret goes before the struck words (Backspace) or after them (Delete).
  if (caret !== null && ops.every((op) => op.kind === 'delete') && state.selection.empty)
    tr.setSelection(TextSelection.near(tr.doc.resolve(caret)));
  // The same undo step holds the edit and its marks, so Undo takes both back.
  return tr.setMeta(SKIP_TRACKING, true).setMeta(KEEP_AI_MARKS, true);
}

const trackKey = new PluginKey('vloTrackChanges');

function trackPlugin(type: MarkType): Plugin {
  let composing = false;
  // Edits made while an input method composes, applied when it ends.
  let pending: Op[] = [];
  // True after the Delete key, false after Backspace, until the next edit. The editor's own selection
  // can be a step behind the screen when the key comes, so the key decides where the caret goes.
  let forwardKey: boolean | null = null;
  return new Plugin({
    key: trackKey,
    props: {
      handleKeyDown: (_view, event) => {
        forwardKey = event.key === 'Delete' ? true : event.key === 'Backspace' ? false : null;
        return false;
      },
      handleDOMEvents: {
        beforeinput: (_view, event) => {
          const input = event.inputType;
          if (input.endsWith('Forward')) forwardKey = true;
          else if (input.endsWith('Backward')) forwardKey = false;
          return false;
        },
        compositionstart: () => {
          composing = true;
          return false;
        },
        compositionend: (view) => {
          composing = false;
          setTimeout(() => {
            if (!view.isDestroyed && pending.length > 0)
              view.dispatch(view.state.tr.setMeta(trackKey, 'flush'));
          }, 0);
          return false;
        },
      },
    },
    appendTransaction: (transactions, old, state) => {
      for (const tr of transactions) for (const step of tr.steps) pending = mapOps(pending, step);
      const tracking = getTracking();
      if (!tracking.on) {
        pending = [];
        return null;
      }
      const ops = [...pending, ...opsOf(transactions, old, type, forwardKey)];
      if (transactions.some((tr) => tr.docChanged)) forwardKey = null;
      if (composing) {
        pending = ops;
        return null;
      }
      pending = [];
      return applyOps(state, ops, type, tracking.pass);
    },
  });
}

export const SuggestionMark = Mark.create({
  name: SUGGESTION,
  inclusive: false,
  // A suggestion and a comment can share words, but two suggestions cannot.
  excludes: SUGGESTION,

  addAttributes() {
    return {
      id: { default: '', renderHTML: (attrs: SuggestionAttrs) => ({ 'data-change-id': attrs.id }) },
      kind: { default: 'insert', renderHTML: (attrs: SuggestionAttrs) => ({ 'data-change': attrs.kind }) },
      pass: { default: 1, renderHTML: (attrs: SuggestionAttrs) => ({ 'data-pass': String(attrs.pass) }) },
      at: { default: 0, rendered: false },
      by: { default: '', rendered: false },
    };
  },

  parseHTML() {
    return [];
  },

  renderHTML({ HTMLAttributes }) {
    return ['span', { ...HTMLAttributes, class: 'vlo-change' }, 0];
  },

  addCommands() {
    return {
      acceptChange:
        (id) =>
        ({ tr, dispatch }) =>
          settle(tr, this.type, new Set([id]), true, dispatch),
      rejectChange:
        (id) =>
        ({ tr, dispatch }) =>
          settle(tr, this.type, new Set([id]), false, dispatch),
      acceptAll:
        (pass) =>
        ({ state, tr, dispatch }) =>
          settle(tr, this.type, idsOf(state, pass), true, dispatch),
      rejectAll:
        (pass) =>
        ({ state, tr, dispatch }) =>
          settle(tr, this.type, idsOf(state, pass), false, dispatch),
    };
  },

  addProseMirrorPlugins() {
    return [trackPlugin(this.type)];
  },
});
