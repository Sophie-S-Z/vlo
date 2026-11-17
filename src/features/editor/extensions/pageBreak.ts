import { mergeAttributes, Node } from '@tiptap/core';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    pageBreak: {
      /** Inserts a page break and an empty paragraph after it. */
      insertPageBreak: () => ReturnType;
    };
  }
}

/** A CSS page break before or after an element. */
const BREAK_STYLE = /(page-break-(before|after)\s*:\s*always|break-(before|after)\s*:\s*page)/i;

/**
 * A page break (Phase 19, Task B5). The page view, Word, PDF and the book layout start a new page after it.
 * Pageless shows a quiet rule. Mod-Enter puts one at the caret.
 */
export const PageBreak = Node.create({
  name: 'pageBreak',
  group: 'block',
  atom: true,
  selectable: true,

  parseHTML() {
    // Word, Google Docs and Markdown files mark a page break with a CSS break on an empty element.
    const styled = (element: HTMLElement) =>
      element.textContent.trim() === '' && BREAK_STYLE.test(element.getAttribute('style') ?? '')
        ? null
        : false;
    return [
      { tag: 'div[data-page-break]' },
      { tag: 'div', getAttrs: styled, priority: 60 },
      { tag: 'hr', getAttrs: styled, priority: 60 },
      { tag: 'br', getAttrs: styled, priority: 60 },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'div',
      mergeAttributes(HTMLAttributes, {
        'data-page-break': '',
        role: 'separator',
        'aria-label': 'Page break',
      }),
      // The CSS writes "Page break" in the span, so the words stay out of the text.
      ['span'],
    ];
  },

  addCommands() {
    return {
      insertPageBreak:
        () =>
        ({ chain }) =>
          chain()
            .insertContent([{ type: this.name }, { type: 'paragraph' }])
            .run(),
    };
  },

  addKeyboardShortcuts() {
    return { 'Mod-Enter': () => this.editor.commands.insertPageBreak() };
  },
});
