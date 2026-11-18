import type { Editor } from '@tiptap/core';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import { cleanFontValue } from './format/fonts';
import { STYLE_LIMITS, type ParagraphStyle, type StyleLook } from './format/paragraphStyles';
import { findStyle, getParagraphStyles, saveParagraphStyles } from './format/paragraphStyleStore';

/*
 * The editor side of paragraph styles (Phase 19, Task E2): the style at the cursor, the look of a
 * paragraph, and "Update the style to match", as in Word.
 */

const ALIGNS = ['left', 'center', 'right', 'justify'] as const;

/** The paragraph at the start of the selection, with its place, or null in a heading or a poem. */
function paragraphAt(editor: Editor): { node: ProseMirrorNode; pos: number } | null {
  const { $from } = editor.state.selection;
  for (let depth = $from.depth; depth > 0; depth -= 1) {
    const node = $from.node(depth);
    if (node.type.name === 'paragraph') return { node, pos: $from.before(depth) };
  }
  return null;
}

/** The style of the paragraph at the cursor, or undefined for body text or a deleted style. */
export function styleAt(editor: Editor): ParagraphStyle | undefined {
  return findStyle(paragraphAt(editor)?.node.attrs.styleId);
}

/** The one value that each text of the paragraph shares, or undefined. */
function shared(node: ProseMirrorNode, read: (text: ProseMirrorNode) => unknown): unknown {
  const values = new Set<unknown>();
  node.descendants((child) => {
    if (child.isText) values.add(read(child));
  });
  return values.size === 1 ? [...values][0] : undefined;
}

const textStyle = (text: ProseMirrorNode, key: string): unknown =>
  text.marks.find((m) => m.type.name === 'textStyle')?.attrs[key];

/** The formats that the writer gave the paragraph at the cursor directly, as the parts of a style. */
export function lookAt(editor: Editor): StyleLook {
  const found = paragraphAt(editor);
  if (!found) return {};
  const { node } = found;
  const look: StyleLook = {};
  const align = (ALIGNS as readonly unknown[]).includes(node.attrs.textAlign)
    ? (node.attrs.textAlign as StyleLook['align'])
    : undefined;
  if (align) look.align = align;
  if (shared(node, (t) => t.marks.some((m) => m.type.name === 'italic')) === true) look.italic = true;
  const font = cleanFontValue(shared(node, (t) => textStyle(t, 'font')));
  if (font !== null) look.font = font;
  const fontSize = shared(node, (t) => textStyle(t, 'fontSize'));
  const size = typeof fontSize === 'string' ? Number.parseFloat(fontSize) : Number.NaN;
  const [min, max] = STYLE_LIMITS.size;
  if (Number.isFinite(size) && size >= min && size <= max && size !== 1) look.size = size;
  return look;
}

/** Takes the parts of `look` off the paragraph at the cursor, so the paragraph shows its style. */
export function absorbLook(editor: Editor, look: StyleLook): void {
  const found = paragraphAt(editor);
  if (!found) return;
  const { state } = editor;
  const { tr, schema } = state;
  const from = found.pos + 1;
  const to = found.pos + found.node.nodeSize - 1;
  if (look.italic && schema.marks.italic) tr.removeMark(from, to, schema.marks.italic);
  if (look.font !== undefined || look.size !== undefined) {
    found.node.descendants((child, offset) => {
      const mark = child.marks.find((m) => m.type.name === 'textStyle');
      if (!child.isText || !mark) return;
      const attrs: Record<string, unknown> = {
        ...mark.attrs,
        ...(look.font !== undefined ? { font: null } : {}),
        ...(look.size !== undefined ? { fontSize: null } : {}),
      };
      const start = from + offset;
      const end = start + child.nodeSize;
      tr.removeMark(start, end, mark);
      // A textStyle mark with no value left goes away, as removeEmptyTextStyle does.
      if (Object.values(attrs).some((v) => v !== null)) tr.addMark(start, end, mark.type.create(attrs));
    });
  }
  if (look.align) tr.setNodeAttribute(found.pos, 'textAlign', null);
  if (tr.docChanged) editor.view.dispatch(tr);
}

/** "Update the style to match": the style of the paragraph at the cursor takes its direct formats. */
export function updateStyleToMatch(editor: Editor): boolean {
  const style = styleAt(editor);
  if (!style) return false;
  const look = lookAt(editor);
  const next = { ...style, ...look };
  absorbLook(editor, look);
  void saveParagraphStyles(getParagraphStyles().map((s) => (s.id === style.id ? next : s))).catch(
    () => undefined,
  );
  return true;
}
