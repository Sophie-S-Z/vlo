import { Mark, mergeAttributes } from '@tiptap/core';
import { parsePlay, playClass, playStyle, type TypePlay } from '../format/typePlay';

/*
 * The typePlay mark (format/typePlay.ts): weight, letter spacing, design axes, an effect and a motion. The
 * data lives in data-play as JSON. Motion runs in CSS only, and it pauses while the writer types, in Calm
 * mode and under reduced motion (editor.css).
 */

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    typePlay: {
      /** Gives the selection Type play. Empty play removes the mark. */
      setTypePlay: (play: TypePlay) => ReturnType;
      unsetTypePlay: () => ReturnType;
    };
  }
}

export const TYPE_PLAY = 'typePlay';

function readPlay(element: HTMLElement): TypePlay | null {
  try {
    return parsePlay(JSON.parse(element.dataset.play ?? 'null'));
  } catch {
    return null;
  }
}

export const TypePlayMark = Mark.create({
  name: TYPE_PLAY,
  // Text typed at the end of a run joins it, as with a font.
  inclusive: true,

  addAttributes() {
    return {
      play: {
        default: null,
        parseHTML: readPlay,
        renderHTML: (attributes) => {
          const play = parsePlay(attributes.play);
          if (!play) return {};
          return { 'data-play': JSON.stringify(play), class: playClass(play), style: playStyle(play) };
        },
      },
    };
  },

  parseHTML() {
    return [{ tag: 'span[data-play]', getAttrs: (element) => (readPlay(element) ? null : false) }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['span', mergeAttributes(HTMLAttributes), 0];
  },

  addCommands() {
    return {
      setTypePlay:
        (play) =>
        ({ commands }) => {
          const clean = parsePlay(play);
          return clean ? commands.setMark(this.name, { play: clean }) : commands.unsetMark(this.name);
        },
      unsetTypePlay:
        () =>
        ({ commands }) =>
          commands.unsetMark(this.name, { extendEmptyMarkRange: true }),
    };
  },
});
