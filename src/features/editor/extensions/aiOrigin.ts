import { Mark, mergeAttributes, type Editor } from '@tiptap/core';
import { Fragment, Slice, type Node as ProseMirrorNode, type Schema } from '@tiptap/pm/model';
import { Plugin, PluginKey, type Transaction } from '@tiptap/pm/state';
import { yUndoPluginKey, ySyncPluginKey } from '@tiptap/y-tiptap';
import { AI_ORIGIN, type AiOrigin } from '../format/aiOrigin';

/*
 * The aiOrigin mark (spec section 5, F26). Co-writer text that the writer inserts carries the provider,
 * the model and the time. Text that the writer types, also inside AI text, is the writer's own, so a
 * plugin takes the mark off each range that a writer's edit adds. A paste or a drop keeps the mark, so
 * moved AI text stays marked. The mark is always in the document; "Show AI text" only makes it visible.
 */

/** A transaction with this meta is an AI insert, and keeps its mark. */
export const aiInsertKey = new PluginKey('aiInsert');
/** A transaction with this meta keeps the AI marks it brings back, such as a snapshot restore. */
export const KEEP_AI_MARKS = 'vloKeepAiMarks';
const stripKey = new PluginKey('aiOriginStrip');

/** True when the edit keeps the marks it carries: an AI insert, a paste, a drop, or a change from Yjs. */
function keepsMarks(tr: Transaction): boolean {
  if (tr.getMeta(aiInsertKey) !== undefined || tr.getMeta(KEEP_AI_MARKS) !== undefined) return true;
  if (tr.getMeta(ySyncPluginKey) !== undefined) return true;
  const ui: unknown = tr.getMeta('uiEvent');
  return ui === 'paste' || ui === 'drop';
}

/** The ranges of the final document that the writer's own edits added. */
function writerRanges(transactions: readonly Transaction[]): [number, number][] {
  let ranges: [number, number][] = [];
  for (const tr of transactions) {
    const keep = keepsMarks(tr);
    for (const step of tr.steps) {
      const map = step.getMap();
      ranges = ranges
        .map(([from, to]): [number, number] => [map.map(from, 1), map.map(to, -1)])
        .filter(([from, to]) => to > from);
      if (keep) continue;
      map.forEach((_oldStart, _oldEnd, newStart, newEnd) => {
        if (newEnd > newStart) ranges.push([newStart, newEnd]);
      });
    }
  }
  return ranges;
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    aiOrigin: {
      /** Removes the AI mark from the selection, so the writer claims the words as their own. */
      unsetAiOrigin: () => ReturnType;
    };
  }
}

export const AiOriginMark = Mark.create({
  name: AI_ORIGIN,
  // Text typed at the end of AI text is the writer's. The plugin below also clears text typed inside it.
  inclusive: false,

  addAttributes() {
    return {
      provider: {
        default: null,
        parseHTML: (element) => element.getAttribute('data-ai-provider'),
        renderHTML: (attrs) =>
          typeof attrs.provider === 'string' ? { 'data-ai-provider': attrs.provider } : {},
      },
      model: {
        default: null,
        parseHTML: (element) => element.getAttribute('data-ai-model'),
        renderHTML: (attrs) => (typeof attrs.model === 'string' ? { 'data-ai-model': attrs.model } : {}),
      },
      createdAt: {
        default: null,
        parseHTML: (element) => {
          const value = Number(element.getAttribute('data-ai-at'));
          return Number.isFinite(value) && value > 0 ? value : null;
        },
        renderHTML: (attrs) =>
          typeof attrs.createdAt === 'number' ? { 'data-ai-at': String(attrs.createdAt) } : {},
      },
    };
  },

  parseHTML() {
    return [{ tag: 'span[data-ai-provider]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['span', mergeAttributes({ class: 'vlo-ai' }, HTMLAttributes), 0];
  },

  addCommands() {
    return {
      unsetAiOrigin:
        () =>
        ({ commands }) =>
          commands.unsetMark(this.name, { extendEmptyMarkRange: true }),
    };
  },

  addProseMirrorPlugins() {
    const type = this.type;
    return [
      new Plugin({
        key: stripKey,
        appendTransaction: (transactions, _old, state) => {
          if (!transactions.some((tr) => tr.docChanged)) return null;
          const ranges = writerRanges(transactions);
          if (ranges.length === 0) return null;
          const tr = state.tr;
          for (const [from, to] of ranges) {
            if (state.doc.rangeHasMark(from, to, type)) tr.removeMark(from, to, type);
          }
          return tr.docChanged ? tr : null;
        },
      }),
    ];
  },
});

/** The paragraphs of a draft, or for a poem its stanzas of lines. Blank lines split them. */
export function draftBlocks(text: string, kind: 'prose' | 'poem'): string[][] {
  const blocks = text
    .replace(/\r\n?/g, '\n')
    .split(/\n[ \t]*\n/)
    .map((block) => block.replace(/^\n+|\n+$/g, ''))
    .filter((block) => block.trim() !== '');
  if (kind === 'poem') return blocks.map((block) => block.split('\n'));
  const joined = blocks.map((block) => block.replace(/[ \t]*\n[ \t]*/g, ' '));
  // One paragraph joins the text at the cursor, so it keeps its spaces. Paragraphs of their own do not.
  return joined.length === 1 ? [[joined[0] ?? '']] : joined.map((block) => [block.trim()]);
}

/** A slice of marked text for the draft, open at both ends so it joins the blocks at the cursor. */
export function draftSlice(schema: Schema, text: string, kind: 'prose' | 'poem', origin: AiOrigin): Slice {
  const mark = schema.marks[AI_ORIGIN]?.create({ ...origin });
  if (mark === undefined) throw new Error('This editor has no AI mark.');
  const inline = (line: string): ProseMirrorNode[] => (line === '' ? [] : [schema.text(line, [mark])]);
  const blocks = draftBlocks(text, kind);
  if (blocks.length === 0) return Slice.empty;

  if (kind === 'prose') {
    const paragraph = schema.nodes.paragraph;
    if (paragraph === undefined) throw new Error('This editor has no paragraphs.');
    if (blocks.length === 1) return new Slice(Fragment.from(inline(blocks[0]?.[0] ?? '')), 0, 0);
    const nodes = blocks.map((block) => paragraph.create(null, inline(block[0] ?? '')));
    return new Slice(Fragment.from(nodes), 1, 1);
  }

  const stanza = schema.nodes.stanza;
  const poemLine = schema.nodes.poemLine;
  if (stanza === undefined || poemLine === undefined) throw new Error('This editor has no poem lines.');
  const lines = (block: string[]) => block.map((line) => poemLine.create(null, inline(line)));
  const first = blocks[0] ?? [];
  if (blocks.length === 1 && first.length === 1)
    return new Slice(Fragment.from(inline(first[0] ?? '')), 0, 0);
  if (blocks.length === 1) return new Slice(Fragment.from(lines(first)), 1, 1);
  return new Slice(Fragment.from(blocks.map((block) => stanza.create(null, lines(block)))), 2, 2);
}

const WORDLIKE = /[\p{L}\p{N}"'“‘(]/u;

/** A draft of one line gets a space where it would join a word at the cursor, such as "Rain.The". */
function joinSpaces(editor: Editor, from: number, to: number, text: string): string {
  if (text.trim().includes('\n')) return text;
  const { doc } = editor.state;
  const before = from > 0 ? doc.textBetween(Math.max(0, from - 1), from, '\n') : '';
  const after = doc.textBetween(to, Math.min(doc.content.size, to + 1), '\n');
  let out = text;
  if (before !== '' && !/\s/.test(before) && WORDLIKE.test(out.charAt(0))) out = ` ${out}`;
  if (after !== '' && /[\p{L}\p{N}]/u.test(after) && !/\s$/.test(out)) out = `${out} `;
  return out;
}

/**
 * Puts a draft in the text at the selection, in place of selected words, as one undo step. Returns false
 * when there is nothing to insert or the editor cannot take it.
 */
export function insertAiText(
  editor: Editor,
  text: string,
  origin: AiOrigin,
  kind: 'prose' | 'poem',
): boolean {
  if (editor.isDestroyed || !editor.isEditable) return false;
  const { from, to } = editor.state.selection;
  const slice = draftSlice(editor.schema, joinSpaces(editor, from, to, text), kind, origin);
  if (slice.size === 0) return false;
  const undo = yUndoPluginKey.getState(editor.state)?.undoManager;
  undo?.stopCapturing();
  const tr = editor.state.tr.replaceRange(from, to, slice).setMeta(aiInsertKey, true).scrollIntoView();
  if (!tr.docChanged) return false;
  editor.view.dispatch(tr);
  undo?.stopCapturing();
  editor.commands.focus();
  return true;
}
