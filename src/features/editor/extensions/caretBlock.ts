import { Extension } from '@tiptap/core';
import { Plugin, PluginKey, type EditorState } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';

/*
 * The top-level block that holds the caret always renders. Blocks far off screen skip layout with
 * `content-visibility: auto`. After the page around the text changed, as when the writer picked a scene,
 * WebKit kept the block with the caret in its skipped state. Its editing then saw the text as not drawn:
 * the caret went before the first word, and the next key deleted the whole paragraph.
 */

/** The class on the top-level block that holds the caret. The CSS turns off its content-visibility. */
export const CARET_BLOCK_CLASS = 'vlo-caret-block';

interface CaretBlockState {
  /** The start of the block, or -1 when the selection is not in a block. */
  at: number;
  decorations: DecorationSet;
}

export const caretBlockKey = new PluginKey<CaretBlockState>('caretBlock');

function caretBlockAt(state: EditorState): number {
  const { $head } = state.selection;
  if ($head.depth === 0) {
    // A node selection of a top-level block, such as a scene break or an equation on its own line.
    const node = state.doc.nodeAt($head.pos);
    return node ? $head.pos : -1;
  }
  return $head.before(1);
}

function build(state: EditorState): CaretBlockState {
  const at = caretBlockAt(state);
  const node = at >= 0 ? state.doc.nodeAt(at) : null;
  if (!node) return { at: -1, decorations: DecorationSet.empty };
  return {
    at,
    decorations: DecorationSet.create(state.doc, [
      Decoration.node(at, at + node.nodeSize, { class: CARET_BLOCK_CLASS }),
    ]),
  };
}

export const CaretBlock = Extension.create({
  name: 'caretBlock',

  addProseMirrorPlugins() {
    return [
      new Plugin<CaretBlockState>({
        key: caretBlockKey,
        state: {
          init: (_, state) => build(state),
          apply(tr, value, _old, next) {
            if (!tr.docChanged && !tr.selectionSet) return value;
            if (!tr.docChanged) return caretBlockAt(next) === value.at ? value : build(next);
            // A key in the same block keeps the decoration and only maps it.
            const at = value.at < 0 ? -1 : tr.mapping.map(value.at);
            const decorations = value.decorations.map(tr.mapping, tr.doc);
            const kept = decorations.find();
            if (at >= 0 && caretBlockAt(next) === at && kept.length === 1 && kept[0]?.from === at) {
              return { at, decorations };
            }
            return build(next);
          },
        },
        props: {
          decorations: (state) => caretBlockKey.getState(state)?.decorations ?? DecorationSet.empty,
        },
      }),
    ];
  },
});
