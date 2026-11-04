import { mergeAttributes, Node, type Editor, type NodeViewRenderer } from '@tiptap/core';
import type { Node as ProseMirrorNode, NodeType } from '@tiptap/pm/model';
import {
  NodeSelection,
  Plugin,
  PluginKey,
  Selection,
  type EditorState,
  type Transaction,
} from '@tiptap/pm/state';
import type { EditorView } from '@tiptap/pm/view';
import { openPanel } from '../commands/editorBus';
import { cleanLatex, MATH_BLOCK, MATH_INLINE, mathText, selectionLatex } from '../format/math';
import { loadedMath, loadMath, type MathModule } from '../math/load';

/*
 * Equations (plan Task A6). Each equation is an atom node that holds its LaTeX. The node view draws it
 * with MathLive, which loads the first time an equation shows. The equation panel edits it.
 */

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    mathInline: {
      /**
       * Adds an equation in the line and selects it. Selected text in one line becomes the equation's
       * LaTeX, so a writer who typed `x^2` can turn it into an equation.
       */
      insertMath: (latex?: string) => ReturnType;
      /** Replaces the LaTeX of the equation at `pos`. */
      setMathLatex: (pos: number, latex: string) => ReturnType;
    };
    mathBlock: {
      /** Adds an equation on its own line after the current paragraph, or in place of an empty one. */
      insertMathBlock: (latex?: string) => ReturnType;
    };
  }
}

export function isMath(node: ProseMirrorNode | null | undefined): boolean {
  return node?.type.name === MATH_INLINE || node?.type.name === MATH_BLOCK;
}

/** The position of the equation the selection holds, or null. */
export function selectedMath(state: EditorState): number | null {
  const { selection } = state;
  return selection instanceof NodeSelection && isMath(selection.node) ? selection.from : null;
}

/** The place for the caret after the equation at `pos`. */
function afterMath(state: EditorState, pos: number): Selection {
  const size = state.doc.nodeAt(pos)?.nodeSize ?? 1;
  return Selection.near(state.doc.resolve(pos + size), 1);
}

/** Puts the caret just after the equation at `pos` when the equation is still selected. */
export function leaveMath(editor: Editor, pos: number): void {
  if (editor.isDestroyed || selectedMath(editor.state) !== pos) return;
  editor.view.dispatch(editor.state.tr.setSelection(afterMath(editor.state, pos)));
}

/** Removes the equation at `pos` when it is still empty, so a closed panel leaves no empty box. */
export function dropEmptyMath(editor: Editor, pos: number): void {
  if (editor.isDestroyed) return;
  const node = editor.state.doc.nodeAt(pos);
  if (!node || !isMath(node) || cleanLatex(node.attrs.latex).trim() !== '') return;
  const wasSelected = selectedMath(editor.state) === pos;
  const tr = editor.state.tr.delete(pos, pos + node.nodeSize);
  if (wasSelected) tr.setSelection(Selection.near(tr.doc.resolve(Math.min(pos, tr.doc.content.size)), -1));
  // The empty box was never part of the writing, so its removal is not an undo step.
  tr.setMeta('addToHistory', false);
  editor.view.dispatch(tr);
}

/** Draws an equation into `dom`, now when MathLive has loaded, or once it loads. */
function mathNodeView(display: boolean): NodeViewRenderer {
  return ({ node }) => {
    const dom = document.createElement(display ? 'div' : 'span');
    dom.className = display ? 'vlo-math vlo-math-block' : 'vlo-math';
    dom.setAttribute(display ? 'data-math-block' : 'data-math-inline', '');
    dom.setAttribute('role', 'img');
    let latex: string | null = null;
    let drawing = 0;

    const show = (state: 'empty' | 'pending' | 'error' | 'drawn', label: string) => {
      dom.classList.toggle('vlo-math-empty', state === 'empty');
      dom.classList.toggle('vlo-math-pending', state === 'pending');
      dom.classList.toggle('vlo-math-error', state === 'error');
      dom.setAttribute('aria-label', label);
    };

    const paint = (lib: MathModule, text: string) => {
      try {
        dom.replaceChildren(lib.renderMath(text, display));
        show('drawn', `Equation: ${lib.speakMath(text)}`);
      } catch {
        dom.replaceChildren(document.createTextNode(text));
        show('error', `Equation that cannot be drawn: ${text}`);
      }
    };

    const draw = (next: string) => {
      if (next === latex) return;
      latex = next;
      dom.dataset.latex = next;
      const mine = ++drawing;
      if (next.trim() === '') {
        dom.replaceChildren(document.createTextNode('Equation'));
        show('empty', 'Empty equation');
        return;
      }
      const lib = loadedMath();
      if (lib) {
        paint(lib, next);
        return;
      }
      // Until MathLive loads, the LaTeX shows in its place, so the text never jumps to a blank.
      dom.replaceChildren(document.createTextNode(next));
      show('pending', `Equation: ${next}`);
      loadMath().then(
        (loaded) => {
          if (mine === drawing) paint(loaded, next);
        },
        () => {
          if (mine === drawing) show('error', `Equation that cannot be drawn offline: ${next}`);
        },
      );
    };

    draw(cleanLatex(node.attrs.latex));
    return {
      dom,
      update: (updated) => {
        if (updated.type !== node.type) return false;
        draw(cleanLatex(updated.attrs.latex));
        return true;
      },
      // The drawing changes the DOM, and ProseMirror must not read that as an edit.
      ignoreMutation: () => true,
      destroy: () => {
        drawing += 1;
      },
    };
  };
}

const latexAttribute = {
  latex: {
    default: '',
    parseHTML: (element: HTMLElement) => cleanLatex(element.getAttribute('data-latex')),
    renderHTML: (attributes: Record<string, unknown>) => ({ 'data-latex': cleanLatex(attributes.latex) }),
  },
};

interface MathOptions {
  /** Opens the equation panel for the selected equation. */
  onOpen: (editor: Editor) => void;
}

const defaultOptions = (): MathOptions => ({
  onOpen: (editor: Editor) => {
    openPanel({ editor, panel: 'math', anchor: 'caret' });
  },
});

/** Moves the caret after a selected equation, so typed or pasted text never replaces it. */
function stepPast(view: EditorView): boolean {
  const at = selectedMath(view.state);
  if (at === null) return false;
  view.dispatch(view.state.tr.setSelection(afterMath(view.state, at)));
  return true;
}

function insertAndSelect(tr: Transaction, type: NodeType, from: number, to: number, latex: string) {
  tr.replaceRangeWith(from, to, type.create({ latex: cleanLatex(latex) }));
  tr.setSelection(NodeSelection.create(tr.doc, from)).scrollIntoView();
}

export const MathInline = Node.create<MathOptions>({
  name: MATH_INLINE,
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,
  draggable: false,

  // Before the block keymaps, so Enter on a selected equation opens it.
  priority: 110,

  addOptions: defaultOptions,

  addAttributes() {
    return latexAttribute;
  },

  parseHTML() {
    // Above the text style rules for `span`, so an equation never turns into styled text.
    return [{ tag: 'span[data-math-inline]', priority: 60 }];
  },

  renderHTML({ node, HTMLAttributes }) {
    // The LaTeX between $ signs is the text that other apps get from a copy.
    return [
      'span',
      mergeAttributes(HTMLAttributes, { 'data-math-inline': '', class: 'vlo-math' }),
      mathText(cleanLatex(node.attrs.latex), false),
    ];
  },

  renderText({ node }) {
    return mathText(cleanLatex(node.attrs.latex), false);
  },

  addNodeView() {
    return mathNodeView(false);
  },

  addCommands() {
    return {
      insertMath:
        (latex) =>
        ({ state, tr, dispatch }) => {
          const type = state.schema.nodes[MATH_INLINE];
          if (!type) return false;
          const { from, to, $from, $to, empty } = state.selection;
          const oneLine = !empty && $from.sameParent($to) && !(state.selection instanceof NodeSelection);
          const start = oneLine ? from : to;
          const $at = state.doc.resolve(start);
          const endIndex = oneLine ? $to.index() : $at.index();
          if (!$at.parent.inlineContent || !$at.parent.canReplaceWith($at.index(), endIndex, type)) {
            return false;
          }
          if (dispatch) {
            const text = latex ?? (oneLine ? selectionLatex(state.doc.textBetween(from, to, ' ')) : '');
            insertAndSelect(tr, type, start, oneLine ? to : start, text);
          }
          return true;
        },
      setMathLatex:
        (pos, latex) =>
        ({ state, tr, dispatch }) => {
          if (!isMath(state.doc.nodeAt(pos))) return false;
          if (dispatch) tr.setNodeAttribute(pos, 'latex', cleanLatex(latex));
          return true;
        },
    };
  },

  addKeyboardShortcuts() {
    return {
      Enter: ({ editor }) => {
        if (selectedMath(editor.state) === null) return false;
        this.options.onOpen(editor);
        return true;
      },
    };
  },

  addProseMirrorPlugins() {
    const editor = this.editor;
    const onOpen = () => {
      this.options.onOpen(editor);
    };
    return [
      new Plugin({
        key: new PluginKey('math'),
        props: {
          // Typed text goes after a selected equation. Backspace and Delete still remove it.
          handleTextInput: (view, _from, _to, text) => {
            if (!stepPast(view)) return false;
            view.dispatch(view.state.tr.insertText(text).scrollIntoView());
            return true;
          },
          // A paste over a selected equation goes after it, for the same reason.
          handlePaste: (view) => {
            stepPast(view);
            return false;
          },
          // A click on an equation selects it and opens it.
          handleClickOn: (view, _pos, node, nodePos, _event, direct) => {
            if (!direct || !isMath(node)) return false;
            view.dispatch(view.state.tr.setSelection(NodeSelection.create(view.state.doc, nodePos)));
            onOpen();
            return true;
          },
        },
      }),
    ];
  },
});

export const MathBlock = Node.create<MathOptions>({
  name: MATH_BLOCK,
  group: 'block',
  atom: true,
  selectable: true,
  draggable: false,

  addOptions: defaultOptions,

  addAttributes() {
    return latexAttribute;
  },

  parseHTML() {
    return [{ tag: 'div[data-math-block]', priority: 60 }];
  },

  renderHTML({ node, HTMLAttributes }) {
    return [
      'div',
      mergeAttributes(HTMLAttributes, { 'data-math-block': '', class: 'vlo-math vlo-math-block' }),
      mathText(cleanLatex(node.attrs.latex), true),
    ];
  },

  renderText({ node }) {
    return mathText(cleanLatex(node.attrs.latex), true);
  },

  addNodeView() {
    return mathNodeView(true);
  },

  addCommands() {
    return {
      insertMathBlock:
        (latex = '') =>
        ({ state, tr, dispatch }) => {
          const type = state.schema.nodes[MATH_BLOCK];
          if (!type) return false;
          const { $from } = state.selection;
          if (!$from.parent.isTextblock) return false;
          const depth = $from.depth;
          const emptyLine = $from.parent.content.size === 0 && $from.parent.type.name === 'paragraph';
          const from = emptyLine ? $from.before(depth) : $from.after(depth);
          const to = emptyLine ? $from.after(depth) : from;
          const $at = state.doc.resolve(from);
          const index = $at.index();
          if (!$at.parent.canReplaceWith(index, emptyLine ? index + 1 : index, type)) return false;
          if (dispatch) insertAndSelect(tr, type, from, to, latex);
          return true;
        },
    };
  },
});
