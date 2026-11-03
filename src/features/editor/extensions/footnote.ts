import { mergeAttributes, Node, type Editor } from '@tiptap/core';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import { NodeSelection, Plugin, PluginKey, TextSelection, type EditorState } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import { openPanel } from '../commands/editorBus';
import { notePreview, parseNote, type NoteContent } from '../format/notes';

/*
 * Footnotes (plan decision 4). The reference is an inline atom node that holds its own note. Numbers are
 * never stored: a plugin counts the references in document order after each change, so a cut, a paste,
 * an undo or a change from another tab can never leave a number out of order.
 */

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    footnote: {
      /** Inserts an empty footnote after the selection and selects it. */
      insertFootnote: (content?: NoteContent) => ReturnType;
      /** Replaces the note of the footnote at `pos`. */
      setFootnoteContent: (pos: number, content: NoteContent) => ReturnType;
    };
  }
}

export const FOOTNOTE = 'footnote';

export interface FootnoteEntry {
  /** The position of the reference node. */
  pos: number;
  /** 1 for the first reference in the document. */
  number: number;
  content: NoteContent;
}

interface FootnoteState {
  entries: readonly FootnoteEntry[];
  decorations: DecorationSet;
}

export const footnoteKey = new PluginKey<FootnoteState>('footnotes');

function collect(doc: ProseMirrorNode): FootnoteState {
  const entries: FootnoteEntry[] = [];
  const decorations: Decoration[] = [];
  doc.descendants((node, pos) => {
    if (node.type.name !== FOOTNOTE) return !node.isText;
    const number = entries.length + 1;
    const content = parseNote(node.attrs.content);
    entries.push({ pos, number, content });
    const preview = notePreview(content);
    decorations.push(
      Decoration.node(pos, pos + node.nodeSize, {
        'data-n': String(number),
        title: preview === '' ? `Footnote ${String(number)}` : `Footnote ${String(number)}: ${preview}`,
      }),
    );
    return false;
  });
  return { entries, decorations: DecorationSet.create(doc, decorations) };
}

/** The footnotes of a document in order, with their numbers. */
export function footnotesOf(state: EditorState): readonly FootnoteEntry[] {
  return footnoteKey.getState(state)?.entries ?? [];
}

/** The position of the footnote the selection holds, or null. */
export function selectedFootnote(state: EditorState): number | null {
  const { selection } = state;
  return selection instanceof NodeSelection && selection.node.type.name === FOOTNOTE ? selection.from : null;
}

/** Selects the footnote at `pos`, so the note panel can open on it. */
export function selectFootnote(editor: Editor, pos: number): boolean {
  const node = editor.state.doc.nodeAt(pos);
  if (node?.type.name !== FOOTNOTE) return false;
  editor.view.dispatch(
    editor.state.tr.setSelection(NodeSelection.create(editor.state.doc, pos)).scrollIntoView(),
  );
  return true;
}

/** Puts the caret just after the footnote at `pos` when the footnote is still selected. */
export function leaveFootnote(editor: Editor, pos: number): void {
  if (editor.isDestroyed || selectedFootnote(editor.state) !== pos) return;
  const node = editor.state.doc.nodeAt(pos);
  if (!node) return;
  const tr = editor.state.tr.setSelection(TextSelection.create(editor.state.doc, pos + node.nodeSize));
  editor.view.dispatch(tr);
}

interface FootnoteOptions {
  /** Opens the note editor for the selected footnote. */
  onOpen: (editor: Editor) => void;
}

export const Footnote = Node.create<FootnoteOptions>({
  name: FOOTNOTE,
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,
  draggable: false,

  // Before the block keymaps, so Enter on a selected reference opens its note.
  priority: 110,

  addOptions() {
    return {
      onOpen: (editor: Editor) => {
        openPanel({ editor, panel: 'footnote', anchor: 'caret' });
      },
    };
  },

  addAttributes() {
    return {
      content: {
        default: [],
        parseHTML: (element) => {
          try {
            return parseNote(JSON.parse(element.dataset.note ?? '[]'));
          } catch {
            return [];
          }
        },
        renderHTML: (attributes) => ({ 'data-note': JSON.stringify(parseNote(attributes.content)) }),
      },
    };
  },

  parseHTML() {
    // Above the superscript mark's `sup` rule, so a reference never turns into superscript text.
    return [{ tag: 'sup[data-footnote]', priority: 60 }];
  },

  renderHTML({ HTMLAttributes }) {
    // The number comes from CSS (data-n from the plugin), so it is never stale. Its alt text says "Footnote 2".
    return ['sup', mergeAttributes(HTMLAttributes, { 'data-footnote': '', class: 'vlo-footnote-ref' })];
  },

  renderText() {
    return '';
  },

  addCommands() {
    return {
      insertFootnote:
        (content = []) =>
        ({ state, tr, dispatch }) => {
          const type = state.schema.nodes[FOOTNOTE];
          if (!type) return false;
          const at = state.selection.to;
          const $at = state.doc.resolve(at);
          if (!$at.parent.inlineContent || !$at.parent.canReplaceWith($at.index(), $at.index(), type)) {
            return false;
          }
          if (dispatch) {
            tr.insert(at, type.create({ content: parseNote(content) }));
            tr.setSelection(NodeSelection.create(tr.doc, at)).scrollIntoView();
          }
          return true;
        },
      setFootnoteContent:
        (pos, content) =>
        ({ state, tr, dispatch }) => {
          if (state.doc.nodeAt(pos)?.type.name !== FOOTNOTE) return false;
          if (dispatch) tr.setNodeAttribute(pos, 'content', parseNote(content));
          return true;
        },
    };
  },

  addKeyboardShortcuts() {
    return {
      'Mod-Alt-f': ({ editor }) => {
        if (!editor.commands.insertFootnote()) return false;
        this.options.onOpen(editor);
        return true;
      },
      Enter: ({ editor }) => {
        if (selectedFootnote(editor.state) === null) return false;
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
      new Plugin<FootnoteState>({
        key: footnoteKey,
        state: {
          init: (_, state) => collect(state.doc),
          apply: (tr, value) => (tr.docChanged ? collect(tr.doc) : value),
        },
        props: {
          decorations: (state) => footnoteKey.getState(state)?.decorations ?? DecorationSet.empty,
          // Typed text goes after a selected reference and never replaces it, so a note cannot vanish by
          // accident. Backspace and Delete still remove a reference.
          handleTextInput: (view, _from, _to, text) => {
            const at = selectedFootnote(view.state);
            if (at === null) return false;
            const after = at + (view.state.doc.nodeAt(at)?.nodeSize ?? 1);
            const tr = view.state.tr.setSelection(TextSelection.create(view.state.doc, after));
            tr.insertText(text);
            view.dispatch(tr.scrollIntoView());
            return true;
          },
          // A paste over a selected reference goes after it, for the same reason.
          handlePaste: (view) => {
            const at = selectedFootnote(view.state);
            if (at === null) return false;
            const after = at + (view.state.doc.nodeAt(at)?.nodeSize ?? 1);
            view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, after)));
            return false;
          },
          // A click on a reference selects it and opens its note.
          handleClickOn: (view, _pos, node, nodePos, _event, direct) => {
            if (!direct || node.type.name !== FOOTNOTE) return false;
            view.dispatch(view.state.tr.setSelection(NodeSelection.create(view.state.doc, nodePos)));
            onOpen();
            return true;
          },
        },
      }),
    ];
  },
});
