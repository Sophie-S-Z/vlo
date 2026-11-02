import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import type { EditorView } from '@tiptap/pm/view';

/*
 * Tab types spaces in poems and nests lists in prose, so the editor would trap keyboard users.
 * Escape, then Tab, moves focus out of the editor (WCAG 2.1.2). Shift-Tab moves back.
 */

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"]), [contenteditable="true"]';

function moveFocus(view: EditorView, backwards: boolean): void {
  const all = Array.from(document.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (el) => el !== view.dom && !view.dom.contains(el) && !el.closest('[hidden], [inert]'),
  );
  const outside = backwards
    ? all.filter((el) => view.dom.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_PRECEDING).reverse()
    : all.filter((el) => view.dom.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING);
  const target = outside[0];
  if (target) target.focus();
  else view.dom.blur();
}

const MODIFIERS = new Set(['Shift', 'Control', 'Alt', 'Meta']);

export const EscapeTab = Extension.create({
  name: 'escapeTab',
  // Runs before every other key handler, so Tab after Escape never reaches the poem or list keys.
  priority: 10000,
  addProseMirrorPlugins() {
    let armed = false;
    return [
      new Plugin({
        key: new PluginKey('escapeTab'),
        props: {
          handleKeyDown(view, event) {
            if (event.key === 'Escape') {
              armed = true;
              return false;
            }
            if (event.key === 'Tab' && armed) {
              armed = false;
              moveFocus(view, event.shiftKey);
              return true;
            }
            if (!MODIFIERS.has(event.key)) armed = false;
            return false;
          },
          handleDOMEvents: {
            blur() {
              armed = false;
              return false;
            },
          },
        },
      }),
    ];
  },
});
