import { mergeAttributes, Node } from '@tiptap/core';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    sceneBreak: {
      /** Inserts a scene break and an empty paragraph after it. */
      insertSceneBreak: () => ReturnType;
    };
  }
}

/** A centered "#" between scenes. Typing "#" alone on a line, then Enter, makes one. */
export const SceneBreak = Node.create({
  name: 'sceneBreak',
  group: 'block',
  atom: true,
  selectable: true,

  parseHTML() {
    return [{ tag: 'div[data-scene-break]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'div',
      mergeAttributes(HTMLAttributes, {
        'data-scene-break': '',
        role: 'separator',
        'aria-label': 'Scene break',
      }),
      '#',
    ];
  },

  addCommands() {
    return {
      insertSceneBreak:
        () =>
        ({ chain }) =>
          chain()
            .insertContent([{ type: this.name }, { type: 'paragraph' }])
            .run(),
    };
  },

  addKeyboardShortcuts() {
    return {
      Enter: ({ editor }) => {
        const { $from, empty } = editor.state.selection;
        const block = $from.parent;
        if (!empty || block.type.name !== 'paragraph' || block.textContent !== '#') return false;
        if ($from.parentOffset !== block.content.size) return false;
        const from = $from.before();
        const to = $from.after();
        return editor
          .chain()
          .insertContentAt({ from, to }, [{ type: this.name }, { type: 'paragraph' }])
          .run();
      },
    };
  },
});
