import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import { CITE, citeText } from './format/cite';
import { MATH_BLOCK, MATH_INLINE, mathText } from './format/math';

/*
 * Plain text for nodes that hold no text of their own. Search, readable backups, plain-text copies and
 * the poem text all use it, so an equation reads the same way in each.
 */

/**
 * A line break keeps words apart, a scene break is "#", an equation is its LaTeX between $ signs, and a
 * citation is its key, such as "[@marlow2019]".
 */
export function leafText(node: ProseMirrorNode): string {
  switch (node.type.name) {
    case 'hardBreak':
      return '\n';
    case 'sceneBreak':
      return '#';
    case MATH_INLINE:
      return mathText(String(node.attrs.latex ?? ''), false);
    case MATH_BLOCK:
      return mathText(String(node.attrs.latex ?? ''), true);
    case CITE:
      return citeText(node.attrs);
    default:
      return '';
  }
}

/** The plain text of one node: a text run, a leaf such as an equation, or a line with both. */
export function nodeText(node: ProseMirrorNode): string {
  if (node.isText) return node.text ?? '';
  if (node.isLeaf) return leafText(node);
  return node.textBetween(0, node.content.size, '', leafText);
}
