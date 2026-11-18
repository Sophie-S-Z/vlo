import { Extension, type Editor } from '@tiptap/core';
import { Plugin, PluginKey, TextSelection } from '@tiptap/pm/state';
import { cleanPastedHtml, isEditorCopy } from '../format/cleanPaste';

/*
 * Clean paste in prose (Phase 19, Task B2). A paste from another app takes the look of the project. When
 * the clean paste left out a font, a size or a color, a notice offers the original look until the next
 * edit. Mod-Shift-V pastes plain text with the formats at the caret; ProseMirror does that itself.
 */

/** The last clean paste: where it went, and the HTML that the app put on the clipboard. */
interface CleanedPaste {
  from: number;
  to: number;
  html: string;
}

export const cleanPasteKey = new PluginKey<CleanedPaste | null>('cleanPaste');

// A paste with the original look passes through without a change.
let original = false;

/** Pastes the last clean paste again with its fonts, sizes and colors. */
export function keepOriginalLook(editor: Editor): boolean {
  const pasted = cleanPasteKey.getState(editor.state);
  if (!pasted || editor.isDestroyed) return false;
  const { view } = editor;
  view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, pasted.from, pasted.to)));
  original = true;
  try {
    view.pasteHTML(cleanPastedHtml(pasted.html, { look: true }));
  } finally {
    original = false;
  }
  view.focus();
  return true;
}

export const CleanPaste = Extension.create({
  name: 'cleanPaste',

  addProseMirrorPlugins() {
    // The clipboard HTML of a paste that lost its look, from the clean step to the paste transaction.
    let pending: string | null = null;
    return [
      new Plugin<CleanedPaste | null>({
        key: cleanPasteKey,
        state: {
          init: () => null,
          apply: (tr, last, before) => {
            if (tr.getMeta('uiEvent') === 'paste' && pending !== null) {
              const html = pending;
              pending = null;
              return {
                from: tr.mapping.map(before.selection.from, -1),
                to: tr.mapping.map(before.selection.to, 1),
                html,
              };
            }
            // A step that another plugin adds to the paste, such as a footnote number, keeps the notice.
            if (last && tr.getMeta('appendedTransaction') !== undefined) {
              return { ...last, from: tr.mapping.map(last.from, -1), to: tr.mapping.map(last.to, 1) };
            }
            return tr.docChanged ? null : last;
          },
        },
        props: {
          transformPastedHTML: (html) => {
            pending = null;
            if (original || isEditorCopy(html)) return html;
            const clean = cleanPastedHtml(html);
            if (clean !== cleanPastedHtml(html, { look: true })) pending = html;
            return clean;
          },
          transformPastedText: (text) => {
            pending = null;
            return text;
          },
        },
      }),
    ];
  },
});
