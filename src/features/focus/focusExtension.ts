import { Extension } from '@tiptap/core';
import { focusPlugin } from './focusPlugin';
import { getFocusPrefs } from './focusPrefs';

/** Focus-line and sentence dimming and typewriter scrolling, switched by the writer's focus settings. */
export const FocusTools = Extension.create({
  name: 'vloFocus',
  addProseMirrorPlugins() {
    return [
      focusPlugin({
        dim: () => {
          const prefs = getFocusPrefs();
          return prefs.dim ? prefs.dimScope : false;
        },
        typewriter: () => getFocusPrefs().typewriter,
      }),
    ];
  },
});
