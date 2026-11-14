import { Extension, type Editor } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { subscribeCraft } from './craftStore';

/*
 * The Craft switch lives outside the editor. A change there sends the editor an empty transaction, so
 * the More tools menu shows the new state at once. The text and the undo history do not change. The
 * extension also names the editor's item, so the menu of each pane acts on its own poem.
 */

const craftSwitchKey = new PluginKey('vloCraftSwitch');
// A tool surface can read a destroyed editor for one more render, so the item does not live on the editor.
const items = new WeakMap<Editor, string>();

export const CraftSwitch = Extension.create<{ itemId: string | undefined }>({
  name: 'craftSwitch',

  addOptions() {
    return { itemId: undefined };
  },

  onBeforeCreate() {
    if (this.options.itemId !== undefined) items.set(this.editor, this.options.itemId);
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: craftSwitchKey,
        view: (view) => {
          const stop = subscribeCraft(() => {
            if (!view.isDestroyed)
              view.dispatch(view.state.tr.setMeta(craftSwitchKey, true).setMeta('addToHistory', false));
          });
          return { destroy: stop };
        },
      }),
    ];
  },
});

/** The item of the editor, as the editor's Craft switch knows it. */
export function craftItemOf(editor: Editor): string | undefined {
  return items.get(editor);
}
