import { Extension } from '@tiptap/core';
import { Plugin, PluginKey, Selection } from '@tiptap/pm/state';
import type { EditorView } from '@tiptap/pm/view';

/*
 * A click on the blank page under the last line puts the caret after the last word, so the writer can
 * go on writing. Browsers do not agree on this: WebKit put the caret before the first word.
 */

/** The bottom edge of the last block on screen, or null when the document shows no block. */
function lastBlockBottom(view: EditorView): number | null {
  const { doc } = view.state;
  const last = doc.lastChild;
  if (!last) return null;
  const dom = view.nodeDOM(doc.content.size - last.nodeSize);
  return dom instanceof HTMLElement ? dom.getBoundingClientRect().bottom : null;
}

export const ClickBelow = Extension.create({
  name: 'clickBelow',
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('clickBelow'),
        props: {
          handleDOMEvents: {
            mousedown(view, event) {
              // Only a plain click on the page itself. A click on text, a drag or Shift-click keeps the
              // browser's own behaviour.
              if (event.button !== 0 || event.detail > 1 || event.target !== view.dom) return false;
              if (event.shiftKey || event.altKey || event.ctrlKey || event.metaKey) return false;
              const bottom = lastBlockBottom(view);
              if (bottom === null || event.clientY <= bottom) return false;
              event.preventDefault();
              view.focus();
              view.dispatch(view.state.tr.setSelection(Selection.atEnd(view.state.doc)).scrollIntoView());
              return true;
            },
          },
        },
      }),
    ];
  },
});
