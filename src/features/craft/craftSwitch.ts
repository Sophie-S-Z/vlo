import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { subscribeCraft } from './craftStore';

/*
 * The Craft switch lives outside the editor. A change there sends the editor an empty transaction, so
 * the More tools menu shows the new state at once. The text and the undo history do not change.
 */

const craftSwitchKey = new PluginKey('vloCraftSwitch');

export const CraftSwitch = Extension.create({
  name: 'craftSwitch',

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
