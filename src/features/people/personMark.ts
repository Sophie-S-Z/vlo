import { Mark, mergeAttributes } from '@tiptap/core';
import { personIdOf, PRIVATE_NAME } from './markName';

/*
 * The private-name mark (spec section 5, plan decision D3). It lives in the item's Yjs text with the id of
 * the person, so it moves with the text when the writer edits around it. A share-safe export puts the
 * person's alias in place of the marked text.
 */

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    privateName: {
      /** Marks the selected text as a name of this person. */
      setPrivateName: (personId: string) => ReturnType;
      /** Removes the mark from the selection, or from the whole marked name at the cursor. */
      unsetPrivateName: () => ReturnType;
    };
  }
}

export const PrivateName = Mark.create({
  name: PRIVATE_NAME,
  // Text typed at the end of a name is not part of the name. Text typed inside it is.
  inclusive: false,

  addAttributes() {
    return {
      personId: {
        default: null,
        parseHTML: (element) => element.getAttribute('data-person'),
        renderHTML: (attrs) =>
          personIdOf(attrs) === null ? {} : { 'data-person': attrs.personId as string },
      },
    };
  },

  parseHTML() {
    return [{ tag: 'span[data-person]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['span', mergeAttributes({ class: 'vlo-name' }, HTMLAttributes), 0];
  },

  addCommands() {
    return {
      setPrivateName:
        (personId) =>
        ({ commands }) =>
          commands.setMark(this.name, { personId }),
      unsetPrivateName:
        () =>
        ({ commands }) =>
          commands.unsetMark(this.name, { extendEmptyMarkRange: true }),
    };
  },
});
