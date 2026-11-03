import { Extension, Mark, mergeAttributes } from '@tiptap/core';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { fillStyle, parseFill, type TextFill } from '../format/fill';
import { keyPressed } from '../keyEvents';

/*
 * The textFill mark: gradient, metallic, prismatic or glowing text. The data lives in data-fill as JSON,
 * and the look comes from editor.css. Shimmer runs in CSS only, and it pauses while the writer types
 * (TypingState), in Calm mode and under reduced motion (plan decision 3).
 */

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    textFill: {
      /** Gives the selection a fill. Text typed at the end of a filled run joins it. */
      setTextFill: (fill: TextFill) => ReturnType;
      unsetTextFill: () => ReturnType;
    };
  }
}

const hasFillKey = new PluginKey<boolean>('textFillPresent');

export const TextFillMark = Mark.create({
  name: 'textFill',
  // New text typed at the end of the run joins it (Review Focus 1).
  inclusive: true,

  addAttributes() {
    return {
      fill: {
        default: null,
        parseHTML: (element) => {
          try {
            return parseFill(JSON.parse(element.dataset.fill ?? 'null'));
          } catch {
            return null;
          }
        },
        renderHTML: (attributes) => {
          const fill = parseFill(attributes.fill);
          if (!fill) return {};
          return {
            'data-fill': JSON.stringify(fill),
            class: `vlo-fill vlo-fill-${fill.look}${fill.shimmer ? ' vlo-fill-shimmer' : ''}`,
            style: fillStyle(fill),
          };
        },
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'span[data-fill]',
        getAttrs: (element) => {
          try {
            return parseFill(JSON.parse(element.dataset.fill ?? 'null')) ? null : false;
          } catch {
            return false;
          }
        },
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return ['span', mergeAttributes(HTMLAttributes), 0];
  },

  // A text with fills gets the `vlo-has-fill` class, and editor.css gives it its own paint layer.
  addProseMirrorPlugins() {
    const type = this.type;
    const hasFill = (doc: ProseMirrorNode) => doc.rangeHasMark(0, doc.content.size, type);
    return [
      new Plugin<boolean>({
        key: hasFillKey,
        state: {
          init: (_config, state) => hasFill(state.doc),
          apply: (tr, value) => (tr.docChanged ? hasFill(tr.doc) : value),
        },
        props: {
          attributes: (state): Record<string, string> =>
            hasFillKey.getState(state) ? { class: 'vlo-has-fill' } : {},
        },
      }),
    ];
  },

  addCommands() {
    return {
      setTextFill:
        (fill) =>
        ({ commands }) => {
          const clean = parseFill(fill);
          return clean ? commands.setMark(this.name, { fill: clean }) : false;
        },
      unsetTextFill:
        () =>
        ({ commands }) =>
          commands.unsetMark(this.name, { extendEmptyMarkRange: true }),
    };
  },
});

/** How long after the last key the page counts as still being typed in. */
export const TYPING_PAUSE_MS = 1500;

/**
 * Sets `data-typing="true"` on the page root from the first key until 1.5 s after the last key. CSS
 * pauses shimmer and scene motion under it, so no animation work runs while the writer types.
 */
export const TypingState = Extension.create({
  name: 'typingState',

  addProseMirrorPlugins() {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const root = () => (typeof document === 'undefined' ? null : document.documentElement);
    const stop = () => {
      clearTimeout(timer);
      timer = undefined;
      const el = root();
      if (el) delete el.dataset.typing;
    };
    const touch = () => {
      const el = root();
      if (el && el.dataset.typing !== 'true') el.dataset.typing = 'true';
      clearTimeout(timer);
      timer = setTimeout(stop, TYPING_PAUSE_MS);
    };
    return [
      new Plugin({
        key: new PluginKey('typingState'),
        props: {
          handleDOMEvents: {
            keydown: (_view, event) => {
              touch();
              keyPressed(event);
              return false;
            },
            beforeinput: () => {
              touch();
              return false;
            },
            compositionstart: () => {
              touch();
              return false;
            },
          },
        },
        view: () => ({ destroy: stop }),
      }),
    ];
  },
});
