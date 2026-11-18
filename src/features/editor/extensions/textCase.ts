import { Extension } from '@tiptap/core';
import type { Mark, Node as ProseMirrorNode } from '@tiptap/pm/model';
import { TextSelection, type EditorState, type Transaction } from '@tiptap/pm/state';
import { caseCharacters, nextCase, WORD, type TextCase } from '../format/textCase';
import { NODE_MARK } from '../textMap';

/*
 * Change case (Phase 19, Task B2) for every editor. A command changes the selection, or the word at the
 * caret, and keeps the marks of each character. Shift-F3 steps through the cases, as in Word.
 */

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    textCase: {
      /** Puts the selection, or the word at the caret, in the case. */
      setTextCase: (rule: TextCase) => ReturnType;
      /** Puts the selection, or the word at the caret, in the next case. */
      nextTextCase: () => ReturnType;
    };
  }
}

/** The selection, or the word at the caret. Null when the caret is in no word. */
export function wordRange(state: EditorState): { from: number; to: number } | null {
  const { from, to, empty, $from } = state.selection;
  if (!empty) return { from, to };
  const text = $from.parent.textBetween(0, $from.parent.content.size, undefined, NODE_MARK);
  const word = [...text.matchAll(WORD)].find(
    (m) => m.index <= $from.parentOffset && $from.parentOffset <= m.index + m[0].length,
  );
  return word ? { from: $from.start() + word.index, to: $from.start() + word.index + word[0].length } : null;
}

/** The language of the text, from the editor's `lang`. */
function languageOf(dom: Element): string {
  return dom.closest('[lang]')?.getAttribute('lang') ?? 'en';
}

interface Piece {
  from: number;
  to: number;
  text: string;
  marks: readonly Mark[];
}

/** The text runs of each line in the range, each with its text in the case. */
function piecesOf(doc: ProseMirrorNode, from: number, to: number, rule: TextCase, language: string) {
  const pieces: Piece[] = [];
  doc.nodesBetween(from, to, (line, pos) => {
    if (!line.isTextblock) return true;
    const start = Math.max(from, pos + 1);
    const end = Math.min(to, pos + line.nodeSize - 1);
    // One rule over the whole line, so title case knows the first and the last word.
    const chars = caseCharacters(doc.textBetween(start, end, undefined, NODE_MARK), rule, language);
    let index = 0;
    doc.nodesBetween(start, end, (node, at) => {
      if (!node.isInline) return true;
      if (!node.isText) {
        index += 1;
        return false;
      }
      const runFrom = Math.max(start, at);
      const runTo = Math.min(end, at + node.nodeSize);
      const count = Array.from((node.text ?? '').slice(runFrom - at, runTo - at)).length;
      pieces.push({
        from: runFrom,
        to: runTo,
        text: chars.slice(index, index + count).join(''),
        marks: node.marks,
      });
      index += count;
      return false;
    });
    return false;
  });
  return pieces;
}

function applyCase(state: EditorState, tr: Transaction, rule: TextCase, language: string): boolean {
  const range = wordRange(state);
  if (!range) return false;
  const pieces = piecesOf(tr.doc, range.from, range.to, rule, language);
  for (const piece of pieces.reverse()) {
    if (tr.doc.textBetween(piece.from, piece.to) === piece.text) continue;
    tr.replaceWith(piece.from, piece.to, state.schema.text(piece.text, piece.marks));
  }
  if (!tr.docChanged) return false;
  tr.setSelection(TextSelection.create(tr.doc, tr.mapping.map(range.from, -1), tr.mapping.map(range.to, 1)));
  return true;
}

export const TextCaseCommands = Extension.create({
  name: 'textCase',

  addCommands() {
    return {
      setTextCase:
        (rule) =>
        ({ state, tr, view }) =>
          applyCase(state, tr, rule, languageOf(view.dom)),
      nextTextCase:
        () =>
        ({ state, tr, view }) => {
          const range = wordRange(state);
          if (!range) return false;
          const language = languageOf(view.dom);
          return applyCase(
            state,
            tr,
            nextCase(state.doc.textBetween(range.from, range.to), language),
            language,
          );
        },
    };
  },

  addKeyboardShortcuts() {
    return { 'Shift-F3': () => this.editor.commands.nextTextCase() };
  },
});
