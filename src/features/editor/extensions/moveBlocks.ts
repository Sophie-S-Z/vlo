import { Extension } from '@tiptap/core';
import { Fragment, NodeRange, type Node as ProseMirrorNode } from '@tiptap/pm/model';
import type { EditorState, Transaction } from '@tiptap/pm/state';

/*
 * Move blocks (Phase 19, Task B3). Alt-Shift-Up and Alt-Shift-Down move the block at the caret, or the
 * selected blocks, past the block before or after them. A list item moves in its list, and a poem line
 * moves in its stanza. In a poem, Mod-Alt-Shift-Up and Mod-Alt-Shift-Down move the whole stanza.
 */

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    moveBlocks: {
      /** Moves the selected blocks one block up (-1) or down (1). `outer` moves the blocks that hold them. */
      moveBlocks: (direction: -1 | 1, outer?: boolean) => ReturnType;
    };
  }
}

/** The blocks of a list move as whole items, with their own lists inside. */
const ITEMS = new Set(['listItem', 'taskItem']);

/** The selected blocks moved past their neighbor, or null when they are at the end or cannot go there. */
export function moveBlocks(state: EditorState, direction: -1 | 1, outer = false): Transaction | null {
  const { $from, $to } = state.selection;
  const range = $from.blockRange($to);
  if (!range) return null;
  let depth = range.depth;
  while (depth > 0 && ITEMS.has($from.node(depth).type.name)) depth -= 1;
  if (outer) depth -= 1;
  if (depth < 0) return null;
  const moved = new NodeRange($from, $to, depth);
  const { parent, startIndex, endIndex } = moved;
  const other = direction < 0 ? startIndex - 1 : endIndex;
  if (other < 0 || other >= parent.childCount) return null;
  const neighbor = parent.child(other);
  // The new order must fit the parent: a poem keeps a stanza before and after each image.
  const order: ProseMirrorNode[] = [];
  parent.forEach((child) => order.push(child));
  const blocks = order.slice(startIndex, endIndex);
  const next =
    direction < 0
      ? [...order.slice(0, other), ...blocks, neighbor, ...order.slice(endIndex)]
      : [...order.slice(0, startIndex), neighbor, ...blocks, ...order.slice(other + 1)];
  if (!parent.type.validContent(Fragment.from(next))) return null;
  const tr = state.tr;
  if (direction < 0) {
    tr.delete(moved.start - neighbor.nodeSize, moved.start);
    tr.insert(tr.mapping.map(moved.end), neighbor);
  } else {
    tr.delete(moved.end, moved.end + neighbor.nodeSize);
    tr.insert(moved.start, neighbor);
  }
  return tr.scrollIntoView();
}

export const MoveBlocks = Extension.create<{ stanzas: boolean }>({
  name: 'moveBlocks',

  addOptions() {
    return { stanzas: false };
  },

  addCommands() {
    return {
      moveBlocks:
        (direction, outer = false) =>
        ({ state, dispatch }) => {
          const tr = moveBlocks(state, direction, outer);
          if (!tr) return false;
          dispatch?.(tr);
          return true;
        },
    };
  },

  addKeyboardShortcuts() {
    const keys = {
      'Alt-Shift-ArrowUp': () => this.editor.commands.moveBlocks(-1),
      'Alt-Shift-ArrowDown': () => this.editor.commands.moveBlocks(1),
    };
    if (!this.options.stanzas) return keys;
    return {
      ...keys,
      'Mod-Alt-Shift-ArrowUp': () => this.editor.commands.moveBlocks(-1, true),
      'Mod-Alt-Shift-ArrowDown': () => this.editor.commands.moveBlocks(1, true),
    };
  },
});
