import type { Node as ProseMirrorNode } from '@tiptap/pm/model';

/*
 * The text of one paragraph or poem line, with a map from string index to document position. Find and
 * replace and read aloud both work on this text.
 */

/** Stands in for an inline node, such as an equation or a footnote marker, in a block's text. */
export const NODE_MARK = '￼';

export interface BlockText {
  text: string;
  /** The document position of the character at `index`. */
  at: (index: number) => number;
}

/** The text of a textblock that starts at `pos`, with one NODE_MARK for each inline node. */
export function blockText(block: ProseMirrorNode, pos: number): BlockText {
  let text = '';
  const starts: number[] = [];
  const positions: number[] = [];
  block.forEach((child, offset) => {
    starts.push(text.length);
    positions.push(pos + 1 + offset);
    text += child.isText ? (child.text ?? '') : NODE_MARK;
  });
  const at = (index: number): number => {
    let low = 0;
    let high = starts.length - 1;
    while (low < high) {
      const mid = (low + high + 1) >> 1;
      if ((starts[mid] ?? 0) <= index) low = mid;
      else high = mid - 1;
    }
    return (positions[low] ?? pos + 1) + index - (starts[low] ?? 0);
  };
  return { text, at };
}
