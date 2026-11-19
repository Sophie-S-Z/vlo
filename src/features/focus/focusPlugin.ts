import { Plugin, PluginKey, type EditorState, type Transaction } from '@tiptap/pm/state';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import { Decoration, DecorationSet, type EditorView } from '@tiptap/pm/view';
import { ySyncPluginKey } from '@tiptap/y-tiptap';
import { splitSentences } from '@/features/editor/readAloud/sentences';
import { blockText } from '@/features/editor/textMap';
import type { DimScope } from './focusPrefs';

export const focusPluginKey = new PluginKey<FocusState>('vlo-focus');

/** The class on every block except the writer's current one, while dimming is on. */
export const DIM_CLASS = 'vlo-dim';

interface FocusOptions {
  /** What stays clear, or false when dimming is off. */
  dim: () => DimScope | false;
  typewriter: () => boolean;
}

interface FocusState {
  /** Start of the block that holds the cursor, or -1 when dimming is off. */
  current: number;
  decorations: DecorationSet;
}

/**
 * The blocks that dim one by one. A poem dims line by line inside its stanzas. Prose dims each
 * top-level block, so a whole list or quote stays together.
 */
function blocks(state: EditorState): { from: number; to: number }[] {
  const out: { from: number; to: number }[] = [];
  state.doc.forEach((node, offset) => {
    if (node.type.name === 'stanza') {
      node.forEach((line, lineOffset) => {
        const from = offset + 1 + lineOffset;
        out.push({ from, to: from + line.nodeSize });
      });
    } else {
      out.push({ from: offset, to: offset + node.nodeSize });
    }
  });
  return out;
}

function currentBlock(state: EditorState): number {
  const head = state.selection.$head;
  if (head.depth === 0) return -1;
  // In a poem the line sits at depth 2; elsewhere the top-level block is at depth 1.
  const depth = head.node(1).type.name === 'stanza' && head.depth >= 2 ? 2 : 1;
  return head.before(depth);
}

const OFF: FocusState = { current: -1, decorations: DecorationSet.empty };

function blockCount(doc: ProseMirrorNode): number {
  let count = 0;
  doc.forEach((node) => {
    count += node.type.name === 'stanza' ? node.childCount : 1;
  });
  return count;
}

/**
 * The sentence with the caret, from the same sentence rules as Read aloud. A sentence never runs across two
 * paragraphs or two poem lines. Null when the caret is in no text.
 */
export function sentenceAt(state: EditorState): { from: number; to: number } | null {
  const { $head, head } = state.selection;
  if (!$head.parent.isTextblock) return null;
  const { text, at } = blockText($head.parent, $head.before());
  let found: { from: number; to: number } | null = null;
  for (const part of splitSentences(text)) {
    const from = at(part.index);
    // The caret after the last character of a sentence still belongs to it.
    const to = part.text.length === 0 ? from : at(part.index + part.text.length - 1) + 1;
    if (head < from) break;
    found = { from, to };
    if (head < to) break;
  }
  return found ?? { from: $head.start(), to: $head.end() };
}

/** The whole document dims, except the sentence with the caret. */
function buildSentence(state: EditorState): FocusState {
  const sentence = sentenceAt(state);
  if (!sentence) return OFF;
  const end = state.doc.content.size;
  const decorations = [
    ...(sentence.from > 0 ? [Decoration.inline(0, sentence.from, { class: DIM_CLASS })] : []),
    ...(sentence.to < end ? [Decoration.inline(sentence.to, end, { class: DIM_CLASS })] : []),
  ];
  return { current: sentence.from, decorations: DecorationSet.create(state.doc, decorations) };
}

function build(state: EditorState, dim: DimScope | false): FocusState {
  if (!dim) return OFF;
  if (dim === 'sentence') return buildSentence(state);
  const current = currentBlock(state);
  const decorations = blocks(state)
    .filter((block) => block.from !== current)
    .map((block) => Decoration.node(block.from, block.to, { class: DIM_CLASS }));
  return { current, decorations: DecorationSet.create(state.doc, decorations) };
}

/**
 * Where the window should scroll so the caret line sits at the vertical center of the visible area.
 * `caretTop` and `caretBottom` are viewport coordinates of the caret. `visibleTop` is where the visible
 * area starts, which is below 0 when a phone's keyboard pushes it.
 */
export function typewriterTarget(
  caretTop: number,
  caretBottom: number,
  visibleHeight: number,
  scrollY: number,
  visibleTop = 0,
) {
  const middle = (caretTop + caretBottom) / 2;
  return Math.max(0, Math.round(scrollY + middle - visibleTop - visibleHeight / 2));
}

/** Scrolls so the caret line sits in the middle of what the writer can see, above a phone's keyboard. */
export function centerCaret(view: EditorView) {
  const { head } = view.state.selection;
  const caret = view.coordsAtPos(head);
  const visible = window.visualViewport;
  const top = typewriterTarget(
    caret.top,
    caret.bottom,
    visible?.height ?? window.innerHeight,
    window.scrollY,
    visible?.offsetTop ?? 0,
  );
  if (Math.abs(top - window.scrollY) > 1) window.scrollTo({ top, behavior: 'instant' });
}

/**
 * Focus-line and sentence dimming and typewriter scrolling. Both read their switch on each change. After a switch
 * changes, dispatch a transaction with `refreshFocus(tr)` so the view updates at once.
 */
export function focusPlugin({ dim, typewriter }: FocusOptions): Plugin<FocusState> {
  return new Plugin<FocusState>({
    key: focusPluginKey,
    state: {
      init: (_config, state) => build(state, dim()),
      apply(tr: Transaction, old: FocusState, _oldState, state): FocusState {
        const scope = dim();
        if (!scope) return old.decorations === DecorationSet.empty ? old : OFF;
        // The sentence can change with each key, and finding it reads only the caret's paragraph.
        if (scope === 'sentence')
          return tr.docChanged || tr.selectionSet || tr.getMeta(focusPluginKey) !== undefined
            ? build(state, scope)
            : old;
        const refresh = tr.getMeta(focusPluginKey) !== undefined;
        const current = currentBlock(state);
        const sameBlock = old.current !== -1 && current === tr.mapping.map(old.current);
        if (!refresh && sameBlock) {
          if (!tr.docChanged) return old;
          // Typing inside the same block keeps the block list, so the marks only move. A change from another
          // tab or Yjs undo replaces whole blocks, and a replaced block loses its mark, so it builds again.
          if (blockCount(tr.before) === blockCount(state.doc) && tr.getMeta(ySyncPluginKey) === undefined) {
            return { current, decorations: old.decorations.map(tr.mapping, tr.doc) };
          }
        }
        return build(state, scope);
      },
    },
    props: {
      decorations: (state) => focusPluginKey.getState(state)?.decorations,
    },
    view: () => ({
      update(view, previous) {
        if (!typewriter()) return;
        const moved = !view.state.selection.eq(previous.selection) || view.state.doc !== previous.doc;
        if (moved && view.hasFocus()) centerCaret(view);
      },
    }),
  });
}

/** Marks a transaction so the focus plugin rebuilds after a switch changes. */
export function refreshFocus(tr: Transaction): Transaction {
  return tr.setMeta(focusPluginKey, true);
}
