import { Extension } from '@tiptap/core';
import { focusPlugin } from './focusPlugin';
import { getFocusPrefs } from './focusPrefs';

/** Focus-line dimming and typewriter scrolling, switched by the writer's focus settings. */
export const FocusTools = Extension.create({
  name: 'vloFocus',
  addProseMirrorPlugins() {
    return [focusPlugin({ dim: () => getFocusPrefs().dim, typewriter: () => getFocusPrefs().typewriter })];
  },
});
