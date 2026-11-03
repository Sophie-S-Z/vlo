import { Node, type AnyExtension } from '@tiptap/core';
import Collaboration from '@tiptap/extension-collaboration';
import { Fragment, Slice, type Node as ProseMirrorNode, type Schema } from '@tiptap/pm/model';
import { Plugin, PluginKey, type EditorState, type Transaction } from '@tiptap/pm/state';
import StarterKit from '@tiptap/starter-kit';
import type * as Y from 'yjs';
import { YFRAGMENT } from '@/lib/ydocs';
import { nodeText } from '../leafText';
import { parsePoemText, poemDataToText, type PoemData } from '../poemText';
import { EscapeTab } from './escapeTab';
import { Footnote } from './footnote';
import { MathInline } from './math';
import { ClearFormatting, inlineFormatting } from './formatting';

/* The poem schema: doc > stanza+ > poemLine+ > inline. Every space is content, and lines keep layout. */

export const MAX_HANGING_EM = 8;

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    poemLine: {
      /** Sets the hanging indent of each selected line, 0 to 8 em. */
      setHanging: (em: number) => ReturnType;
      /** Adds the tab width of spaces at the start of each selected line. */
      indentLine: () => ReturnType;
      /** Removes up to the tab width of leading spaces from each selected line. */
      outdentLine: () => ReturnType;
    };
  }
}

interface PoemOptions {
  tabSpaces: number;
}

const PoemDocument = Node.create({
  name: 'doc',
  topNode: true,
  content: 'stanza+',
});

const Stanza = Node.create({
  name: 'stanza',
  content: 'poemLine+',
  defining: true,
  parseHTML() {
    return [{ tag: 'div[data-stanza]' }];
  },
  renderHTML() {
    return ['div', { 'data-stanza': '' }, 0];
  },
});

/** Each poemLine in the selection, with its position, from last to first so edits keep earlier positions. */
function selectedLines(state: EditorState): { node: ProseMirrorNode; pos: number }[] {
  const out: { node: ProseMirrorNode; pos: number }[] = [];
  const { from, to } = state.selection;
  state.doc.nodesBetween(from, to, (node, pos) => {
    if (node.type.name === 'poemLine') out.push({ node, pos });
    return node.type.name !== 'poemLine';
  });
  return out.reverse();
}

function leadingSpaces(text: string): number {
  return text.length - text.replace(/^ +/, '').length;
}

/** The spaces at the start of a line, up to its first character, footnote or equation. */
function lineIndent(line: ProseMirrorNode): number {
  let count = 0;
  for (let i = 0; i < line.childCount; i++) {
    const child = line.child(i);
    const text = child.isText ? (child.text ?? '') : '';
    const spaces = leadingSpaces(text);
    count += spaces;
    if (!child.isText || spaces < text.length) break;
  }
  return count;
}

/** Stanza nodes for poem data. */
function poemNodes(schema: Schema, poem: PoemData): ProseMirrorNode[] {
  const { stanza, poemLine } = schema.nodes;
  if (!stanza || !poemLine) throw new Error('The poem schema is missing.');
  return poem.map((lines) =>
    stanza.create(
      null,
      lines.map((line) =>
        poemLine.create({ hanging: line.hanging }, line.text === '' ? null : schema.text(line.text)),
      ),
    ),
  );
}

/** Plain text of a pasted slice that has no text/plain copy. Whitespace-only paragraphs are blank lines. */
function sliceText(slice: Slice): string {
  const lines: string[] = [];
  slice.content.descendants((node) => {
    if (!node.isTextblock) return true;
    const text = nodeText(node).replace(/\u00a0/g, ' ');
    lines.push(text.trim() === '' ? '' : text);
    return false;
  });
  return lines.join('\n');
}

/** Poem data for a copied slice: whole stanzas, or one stanza when the copy sits inside one. */
function sliceToPoem(slice: Slice): PoemData {
  const poem: PoemData = [];
  let loose: PoemData[number] = [];
  let previousInline = false;
  slice.content.forEach((node) => {
    if (node.type.name === 'stanza') {
      if (loose.length > 0) poem.push(loose);
      loose = [];
      const lines: PoemData[number] = [];
      node.forEach((line) => lines.push({ text: nodeText(line), hanging: Number(line.attrs.hanging) || 0 }));
      poem.push(lines);
    } else if (node.type.name === 'poemLine') {
      loose.push({ text: nodeText(node), hanging: Number(node.attrs.hanging) || 0 });
    } else if (node.isInline) {
      // Inline pieces of one line (text runs with different styles, footnotes, equations) join into that line.
      const last = loose[loose.length - 1];
      if (last && previousInline) last.text += nodeText(node);
      else loose.push({ text: nodeText(node), hanging: 0 });
    }
    previousInline = node.isInline;
  });
  if (loose.length > 0) poem.push(loose);
  return poem;
}

function insertPoemText(tr: Transaction, schema: Schema, text: string): void {
  const clean = text.replace(/\r\n?/g, '\n').replace(/\u00a0/g, ' ');
  if (!clean.includes('\n')) {
    tr.insertText(clean);
    return;
  }
  const poem = parsePoemText(clean);
  if (poem.length === 0) return;
  // Open on both sides, so the first line joins the line at the cursor and the last line joins the rest.
  tr.replaceSelection(new Slice(Fragment.fromArray(poemNodes(schema, poem)), 2, 2));
}

const PoemLine = Node.create<PoemOptions>({
  name: 'poemLine',
  // Text and inline atoms such as footnotes. Hard breaks are off, so a line stays one line.
  content: 'inline*',
  marks: '_',
  whitespace: 'pre',
  defining: true,

  addOptions() {
    return { tabSpaces: 4 };
  },

  addAttributes() {
    return {
      hanging: {
        default: 0,
        parseHTML: (element) => Math.min(Math.max(Number(element.dataset.hanging) || 0, 0), MAX_HANGING_EM),
        renderHTML: (attributes) => {
          const em = Number(attributes.hanging) || 0;
          if (em === 0) return {};
          return {
            'data-hanging': String(em),
            style: `padding-left: ${String(em)}em; text-indent: -${String(em)}em`,
          };
        },
      },
    };
  },

  parseHTML() {
    return [
      { tag: 'p[data-poem-line]', preserveWhitespace: 'full' },
      // Paragraphs from other apps become lines. Their spaces stay.
      { tag: 'p', preserveWhitespace: 'full', priority: 40 },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return ['p', { 'data-poem-line': '', ...HTMLAttributes }, 0];
  },

  addCommands() {
    return {
      setHanging:
        (em) =>
        ({ tr, state, dispatch }) => {
          const value = Math.min(Math.max(Math.round(em), 0), MAX_HANGING_EM);
          const lines = selectedLines(state);
          if (lines.length === 0) return false;
          if (dispatch) for (const { pos } of lines) tr.setNodeAttribute(pos, 'hanging', value);
          return true;
        },
      indentLine:
        () =>
        ({ tr, state, dispatch }) => {
          const lines = selectedLines(state);
          if (lines.length === 0) return false;
          if (dispatch)
            for (const { pos } of lines) tr.insertText(' '.repeat(this.options.tabSpaces), pos + 1);
          return true;
        },
      outdentLine:
        () =>
        ({ tr, state, dispatch }) => {
          const lines = selectedLines(state);
          if (lines.length === 0) return false;
          if (dispatch) {
            for (const { node, pos } of lines) {
              const count = Math.min(lineIndent(node), this.options.tabSpaces);
              if (count > 0) tr.delete(pos + 1, pos + 1 + count);
            }
          }
          return true;
        },
    };
  },

  addKeyboardShortcuts() {
    return {
      Tab: ({ editor }) =>
        editor.commands.command(({ tr }) => {
          tr.insertText(' '.repeat(this.options.tabSpaces));
          return true;
        }),
      'Shift-Tab': ({ editor }) => editor.commands.outdentLine(),
      Enter: ({ editor }) => {
        const { $from, empty } = editor.state.selection;
        // An empty line that is not the first in its stanza becomes the first line of a new stanza.
        if (
          empty &&
          $from.parent.type.name === 'poemLine' &&
          $from.parent.content.size === 0 &&
          $from.index(1) > 0
        ) {
          return editor.commands.command(({ tr }) => {
            tr.split($from.before(2), 1);
            return true;
          });
        }
        return editor.commands.splitBlock();
      },
      'Mod-Enter': ({ editor }) =>
        editor.commands.command(({ tr, state }) => {
          tr.deleteSelection();
          const pos = tr.mapping.map(state.selection.from);
          tr.split(pos, 2);
          return true;
        }),
    };
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('poemClipboard'),
        props: {
          // Paste keeps plain text with every space. Styles, images and links from other apps drop.
          handlePaste: (view, event, slice) => {
            // A copy from a Vlo poem keeps its styles and footnotes. ProseMirror pastes it with every space.
            const html = event.clipboardData?.getData('text/html') ?? '';
            if (html.includes('data-pm-slice') && html.includes('data-poem-line')) return false;
            const plain = event.clipboardData?.getData('text/plain');
            const text = plain !== undefined && plain !== '' ? plain : sliceText(slice);
            const { tr } = view.state;
            insertPoemText(tr, view.state.schema, text);
            view.dispatch(tr.scrollIntoView());
            return true;
          },
          // A copy inside one line has no line around it. Wrapping it keeps the copy marked as a Vlo poem.
          transformCopied: (slice, view) => {
            const line = view.state.schema.nodes.poemLine;
            if (!line || slice.openStart > 0 || slice.content.childCount === 0) return slice;
            for (let i = 0; i < slice.content.childCount; i++) {
              if (!slice.content.child(i).isInline) return slice;
            }
            return new Slice(Fragment.from(line.create(null, slice.content)), 1, 1);
          },
          clipboardTextSerializer: (slice) => poemDataToText(sliceToPoem(slice)).replace(/\n$/, ''),
        },
      }),
    ];
  },
});

/** The poem schema with every inline format. Block formats stay out, so lines keep their layout. */
export function poemExtensions(ydoc: Y.Doc, opts: PoemOptions): AnyExtension[] {
  return [
    StarterKit.configure({
      document: false,
      paragraph: false,
      heading: false,
      blockquote: false,
      bulletList: false,
      orderedList: false,
      listItem: false,
      listKeymap: false,
      code: false,
      codeBlock: false,
      hardBreak: false,
      horizontalRule: false,
      link: false,
      undoRedo: false,
      trailingNode: false,
      dropcursor: false,
      gapcursor: false,
    }),
    PoemDocument,
    Stanza,
    PoemLine.configure(opts),
    ...inlineFormatting(),
    ClearFormatting.configure({ blocks: false }),
    Footnote,
    MathInline,
    EscapeTab,
    Collaboration.configure({ document: ydoc, field: YFRAGMENT }),
  ];
}
