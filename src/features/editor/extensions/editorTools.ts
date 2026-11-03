import { Extension, type Editor } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';

/*
 * Small editor helpers for the tool surfaces.
 * HeldSelection keeps the selected text marked while a panel has focus, so the writer sees what a color
 * or size will change. ToolKeys adds Mod-/ (shortcut sheet) and Alt-F10 (move to the tools).
 */

export const heldKey = new PluginKey<DecorationSet>('heldSelection');

type HeldMeta = { hold: true } | { release: true };

export const HeldSelection = Extension.create({
  name: 'heldSelection',

  addProseMirrorPlugins() {
    return [
      new Plugin<DecorationSet>({
        key: heldKey,
        state: {
          init: () => DecorationSet.empty,
          apply(tr, set, _old, next) {
            const meta = tr.getMeta(heldKey) as HeldMeta | undefined;
            if (meta && 'release' in meta) return DecorationSet.empty;
            if (meta && 'hold' in meta) {
              const { from, to, empty } = next.selection;
              if (empty) return DecorationSet.empty;
              return DecorationSet.create(next.doc, [
                Decoration.inline(from, to, { class: 'vlo-held-selection' }),
              ]);
            }
            return set.map(tr.mapping, tr.doc);
          },
        },
        props: {
          decorations: (state) => heldKey.getState(state),
        },
      }),
    ];
  },
});

export interface ToolKeysOptions {
  /** Opens the keyboard shortcut sheet. */
  onShortcuts: (editor: Editor) => void;
  /** Moves focus to the selection menu when it shows, else to the toolbar. Returns false when neither shows. */
  onToolFocus: (editor: Editor) => boolean;
}

export const ToolKeys = Extension.create<ToolKeysOptions>({
  name: 'toolKeys',

  addOptions() {
    return { onShortcuts: () => undefined, onToolFocus: () => false };
  },

  addKeyboardShortcuts() {
    return {
      'Mod-/': () => {
        this.options.onShortcuts(this.editor);
        return true;
      },
      'Alt-F10': () => this.options.onToolFocus(this.editor),
    };
  },
});
