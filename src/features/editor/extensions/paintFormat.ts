import { Extension } from '@tiptap/core';
import type { Mark } from '@tiptap/pm/model';
import { Plugin, PluginKey, type EditorState } from '@tiptap/pm/state';
import type { EditorView } from '@tiptap/pm/view';
import { KEPT_MARKS } from './formatting';

/*
 * Paint format (Phase 19, Task B2), as in Word and Google Docs. The tool copies the formats and the
 * paragraph look at the caret, and the next selection takes them. A second press keeps the brush on for
 * more selections, and a third press or Escape puts it away. A selection takes the brush when the mouse
 * button or the Shift key comes up, so a drag or Shift-arrows paint once at the end.
 */

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    paintFormat: {
      /** Takes the brush, keeps it on, or puts it away. */
      paintFormat: () => ReturnType;
    };
  }
}

interface Brush {
  marks: readonly Mark[];
  /** The paragraph look: the block attributes in `LOOK` at the caret. */
  look: Readonly<Record<string, unknown>>;
  keep: boolean;
}

export const paintKey = new PluginKey<Brush | null>('paintFormat');

/** The block attributes that make the paragraph look. */
const LOOK = ['textAlign', 'lineSpacing', 'firstLineIndent'] as const;

/** A format, not a fact about the text such as a comment, and not a link. */
const isFormat = (mark: Mark) => !KEPT_MARKS.has(mark.type.name) && mark.type.name !== 'link';

function brushOf(state: EditorState): Brush {
  const { $from, from, empty } = state.selection;
  const first = state.doc.nodeAt(from);
  const marks = empty ? (state.storedMarks ?? $from.marks()) : first?.isText ? first.marks : $from.marks();
  const look: Record<string, unknown> = {};
  for (const key of LOOK) if (key in $from.parent.attrs) look[key] = $from.parent.attrs[key];
  return { marks: marks.filter(isFormat), look, keep: false };
}

/** Puts the brush on the selection. */
function paint(view: EditorView, brush: Brush): void {
  const { state } = view;
  const { from, to } = state.selection;
  const tr = state.tr;
  for (const type of Object.values(state.schema.marks)) {
    if (!KEPT_MARKS.has(type.name) && type.name !== 'link') tr.removeMark(from, to, type);
  }
  for (const mark of brush.marks) tr.addMark(from, to, mark);
  state.doc.nodesBetween(from, to, (node, pos) => {
    if (!node.isTextblock) return true;
    const attrs = { ...node.attrs };
    for (const [key, value] of Object.entries(brush.look)) if (key in attrs) attrs[key] = value;
    tr.setNodeMarkup(pos, undefined, attrs, node.marks);
    return false;
  });
  if (!brush.keep) tr.setMeta(paintKey, null);
  view.dispatch(tr);
}

export const PaintFormat = Extension.create({
  name: 'paintFormat',

  addCommands() {
    return {
      paintFormat:
        () =>
        ({ state, tr }) => {
          const brush = paintKey.getState(state);
          tr.setMeta(paintKey, brush ? (brush.keep ? null : { ...brush, keep: true }) : brushOf(state));
          return true;
        },
    };
  },

  addProseMirrorPlugins() {
    // The mouse button or the Shift key is down, so the selection is not done.
    let selecting = false;
    let shift = false;
    // The last painted selection. A kept brush paints each selection once.
    let painted: EditorState | null = null;
    const settle = (view: EditorView) => {
      const brush = paintKey.getState(view.state);
      const { selection, doc } = view.state;
      if (!brush || selecting || shift || selection.empty || view.isDestroyed) return;
      if (painted?.doc === doc && painted.selection.eq(selection)) return;
      paint(view, brush);
      painted = view.state;
    };
    return [
      new Plugin<Brush | null>({
        key: paintKey,
        state: {
          init: () => null,
          apply: (tr, brush) => {
            const meta = tr.getMeta(paintKey) as Brush | null | undefined;
            return meta === undefined ? brush : meta;
          },
        },
        view: (view) => {
          // The button can come up outside the text, at the end of a drag.
          const up = () => {
            if (!selecting) return;
            selecting = false;
            // The selection of a drag can change once more after the button comes up.
            setTimeout(() => {
              settle(view);
            });
          };
          window.addEventListener('mouseup', up);
          return {
            update: (_view, before) => {
              if (!view.state.selection.eq(before.selection)) settle(view);
            },
            destroy: () => {
              window.removeEventListener('mouseup', up);
            },
          };
        },
        props: {
          attributes: (state): Record<string, string> =>
            paintKey.getState(state) ? { 'data-painting': '' } : {},
          handleKeyDown: (view, event) => {
            if (event.key === 'Shift') shift = true;
            if (event.key !== 'Escape' || !paintKey.getState(view.state)) return false;
            view.dispatch(view.state.tr.setMeta(paintKey, null));
            return true;
          },
          handleDOMEvents: {
            mousedown: (_view, event) => {
              // Only the main button selects. A right click's menu can take the mouseup.
              selecting = event.button === 0;
              return false;
            },
            // A Shift key that comes up outside the text, such as in a dialog, ends here.
            blur: () => {
              shift = false;
              return false;
            },
            keyup: (view, event) => {
              if (event.key !== 'Shift') return false;
              shift = false;
              settle(view);
              return false;
            },
          },
        },
      }),
    ];
  },
});
