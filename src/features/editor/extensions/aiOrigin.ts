import { Mark, mergeAttributes, type Editor } from '@tiptap/core';
import { Fragment, Slice, type MarkType, type Node as ProseMirrorNode, type Schema } from '@tiptap/pm/model';
import { Plugin, PluginKey, Selection, type Transaction } from '@tiptap/pm/state';
import { yUndoPluginKey, ySyncPluginKey } from '@tiptap/y-tiptap';
import { AI_ORIGIN, type AiOrigin } from '../format/aiOrigin';
import { leafText } from '../leafText';

/*
 * The aiOrigin mark (spec section 5, F26). Co-writer text that the writer inserts carries the provider,
 * the model and the time. Text that the writer types, also inside AI text, is the writer's own, so a
 * plugin takes the mark off each range that a writer's edit adds. A paste or a drop keeps the mark only
 * when its own content carried it, so moved AI text stays marked and the writer's pasted words do not take
 * the mark of the text around them. While an input method composes, the plugin waits for the end of the
 * composition. The mark is always in the document; "Show AI text" only makes it visible.
 */

/** A transaction with this meta is an AI insert, and keeps its mark. */
export const aiInsertKey = new PluginKey('aiInsert');
/** A transaction with this meta keeps the AI marks it brings back, such as a snapshot restore. */
export const KEEP_AI_MARKS = 'vloKeepAiMarks';
const stripKey = new PluginKey('aiOriginStrip');

/** True when the edit keeps the marks it carries: an AI insert, a restore, or a change from Yjs. */
function keepsMarks(tr: Transaction): boolean {
  if (tr.getMeta(aiInsertKey) !== undefined || tr.getMeta(KEEP_AI_MARKS) !== undefined) return true;
  return tr.getMeta(ySyncPluginKey) !== undefined;
}

const isPasteOrDrop = (tr: Transaction) => {
  const ui: unknown = tr.getMeta('uiEvent');
  return ui === 'paste' || ui === 'drop';
};

type Range = [number, number];

function mapRanges(ranges: readonly Range[], tr: Transaction): Range[] {
  return ranges
    .map(([from, to]): Range => [tr.mapping.map(from, 1), tr.mapping.map(to, -1)])
    .filter(([from, to]) => to > from);
}

/** The ranges of the final document that the writer's own edits added. */
function writerRanges(transactions: readonly Transaction[], keep: (tr: Transaction) => boolean): Range[] {
  let ranges: Range[] = [];
  for (const tr of transactions) {
    const kept = keep(tr);
    for (const step of tr.steps) {
      const map = step.getMap();
      ranges = ranges
        .map(([from, to]): Range => [map.map(from, 1), map.map(to, -1)])
        .filter(([from, to]) => to > from);
      if (kept) continue;
      map.forEach((_oldStart, _oldEnd, newStart, newEnd) => {
        if (newEnd > newStart) ranges.push([newStart, newEnd]);
      });
    }
  }
  return ranges;
}

function sliceHasMark(slice: Slice, type: MarkType): boolean {
  let found = false;
  slice.content.descendants((node) => {
    if (type.isInSet(node.marks)) found = true;
    return !found;
  });
  return found;
}

const htmlHasMark = (data: DataTransfer | null) =>
  (data?.getData('text/html') ?? '').includes('data-ai-provider');

/** Takes the AI mark off the writer's own edits (see the note at the top of this file). */
function stripPlugin(type: MarkType): Plugin {
  let composing = false;
  // Ranges typed during a composition, stripped when it ends.
  let pending: Range[] = [];
  // Whether the next paste or drop carried the AI mark itself. Null when no handler saw it.
  let carried: boolean | null = null;
  const keep = (tr: Transaction) => {
    if (keepsMarks(tr)) return true;
    if (!isPasteOrDrop(tr)) return false;
    const kept = carried !== false;
    carried = null;
    return kept;
  };
  return new Plugin({
    key: stripKey,
    props: {
      handlePaste: (_view, event) => {
        carried = htmlHasMark(event.clipboardData);
        return false;
      },
      handleDrop: (_view, event, slice, moved) => {
        carried = moved ? sliceHasMark(slice, type) : htmlHasMark(event.dataTransfer);
        return false;
      },
      handleDOMEvents: {
        compositionstart: () => {
          composing = true;
          return false;
        },
        compositionend: (view) => {
          composing = false;
          // ProseMirror reads the last composed text after this event, so the strip waits a moment.
          setTimeout(() => {
            if (!view.isDestroyed && pending.length > 0)
              view.dispatch(view.state.tr.setMeta(stripKey, 'flush').setMeta('addToHistory', false));
          }, 0);
          return false;
        },
      },
    },
    appendTransaction: (transactions, _old, state) => {
      for (const tr of transactions) if (tr.docChanged) pending = mapRanges(pending, tr);
      const flush = transactions.some((tr) => tr.getMeta(stripKey) === 'flush');
      if (!flush && !transactions.some((tr) => tr.docChanged)) return null;
      const added = writerRanges(transactions, keep);
      if (composing) {
        pending.push(...added);
        return null;
      }
      const ranges = [...pending, ...added];
      pending = [];
      if (ranges.length === 0) return null;
      const tr = state.tr;
      const size = state.doc.content.size;
      for (const [from, to] of ranges) {
        const a = Math.min(from, size);
        const b = Math.min(to, size);
        if (b > a && state.doc.rangeHasMark(a, b, type)) tr.removeMark(a, b, type);
      }
      return tr.docChanged ? tr : null;
    },
  });
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
    return [stripPlugin(this.type)];
  },
});

/** The paragraphs of a draft, or for a poem its stanzas of lines. Blank lines split them. */
export function draftBlocks(text: string, kind: 'prose' | 'poem'): string[][] {
  const blocks = text
    .replace(/\r\n?/g, '\n')
    .split(/\n[ \t]*\n/)
    .map((block) => block.replace(/^\n+|\n+$/g, ''))
    .filter((block) => block.trim() !== '');
  // A poem keeps each space of its lines. Prose joins the lines of a paragraph.
  if (kind === 'poem') return blocks.map((block) => block.split('\n').map((line) => line.trimEnd()));
  return blocks.map((block) => [block.replace(/\s*\n\s*/g, ' ').trim()]);
}

/** Where the draft needs a space to stay apart from the words at either side of it. */
export interface Join {
  before: boolean;
  after: boolean;
}

/** A slice of marked text for the draft, open at both ends so it joins the blocks at the cursor. */
export function draftSlice(
  schema: Schema,
  text: string,
  kind: 'prose' | 'poem',
  origin: AiOrigin,
  join: Join = { before: false, after: false },
): Slice {
  const mark = schema.marks[AI_ORIGIN]?.create({ ...origin });
  if (mark === undefined) throw new Error('This editor has no AI mark.');
  const inline = (line: string): ProseMirrorNode[] => (line === '' ? [] : [schema.text(line, [mark])]);
  const blocks = draftBlocks(text, kind);
  if (blocks.length === 0) return Slice.empty;
  // The first line joins the text before the cursor, and the last line joins the text after it.
  const first = blocks[0] ?? [];
  if (join.before && !/^\s/.test(first[0] ?? '')) first[0] = ` ${first[0] ?? ''}`;
  const last = blocks[blocks.length - 1] ?? [];
  const end = last[last.length - 1] ?? '';
  if (join.after && !/\s$/.test(end)) last[last.length - 1] = `${end} `;

  if (kind === 'prose') {
    const paragraph = schema.nodes.paragraph;
    if (paragraph === undefined) throw new Error('This editor has no paragraphs.');
    if (blocks.length === 1) return new Slice(Fragment.from(inline(first[0] ?? '')), 0, 0);
    const nodes = blocks.map((block) => paragraph.create(null, inline(block[0] ?? '')));
    return new Slice(Fragment.from(nodes), 1, 1);
  }

  const stanza = schema.nodes.stanza;
  const poemLine = schema.nodes.poemLine;
  if (stanza === undefined || poemLine === undefined) throw new Error('This editor has no poem lines.');
  const lines = (block: string[]) => block.map((line) => poemLine.create(null, inline(line)));
  if (blocks.length === 1 && first.length === 1)
    return new Slice(Fragment.from(inline(first[0] ?? '')), 0, 0);
  if (blocks.length === 1) return new Slice(Fragment.from(lines(first)), 1, 1);
  return new Slice(Fragment.from(blocks.map((block) => stanza.create(null, lines(block)))), 2, 2);
}

const STARTS_WORD = /^[\p{L}\p{N}"'“‘(]/u;
const ENDS_WORD = /[\p{L}\p{N}.,;:!?"'”’)]$/u;

/** A space goes where the draft would touch a word at the cursor, such as "Rain.The". */
function joinOf(editor: Editor, from: number, to: number, text: string): Join {
  const { doc } = editor.state;
  const before = from > 0 ? doc.textBetween(Math.max(0, from - 1), from, '\n') : '';
  const after = doc.textBetween(to, Math.min(doc.content.size, to + 1), '\n');
  const trimmed = text.trim();
  return {
    before: before !== '' && !/\s/.test(before) && STARTS_WORD.test(trimmed),
    after: /[\p{L}\p{N}]/u.test(after) && ENDS_WORD.test(trimmed),
  };
}

/**
 * Puts a draft in the text at the selection, in place of selected words, as one undo step. Gives the range
 * of the new text, or null when there is nothing to insert or the editor cannot take it.
 */
export function insertAiText(
  editor: Editor,
  text: string,
  origin: AiOrigin,
  kind: 'prose' | 'poem',
): { from: number; to: number } | null {
  if (editor.isDestroyed || !editor.isEditable) return null;
  const { from, to } = editor.state.selection;
  const slice = draftSlice(editor.schema, text, kind, origin, joinOf(editor, from, to, text));
  if (slice.size === 0) return null;
  const undo = yUndoPluginKey.getState(editor.state)?.undoManager;
  undo?.stopCapturing();
  const tr = editor.state.tr.replaceRange(from, to, slice).setMeta(aiInsertKey, true).scrollIntoView();
  if (!tr.docChanged) return null;
  const range = { from: tr.mapping.map(from, -1), to: tr.mapping.map(to, 1) };
  // A replaced selection maps to cover the new words. The cursor goes after them, as after typing.
  tr.setSelection(Selection.near(tr.doc.resolve(range.to), -1));
  editor.view.dispatch(tr);
  undo?.stopCapturing();
  editor.commands.focus();
  return range;
}

/** Words of the text, as positions in the item's document and their text. */
export interface Target {
  from: number;
  to: number;
  text: string;
}

/**
 * The words that a rewrite replaces, found again after the text changed: the same range, or else the only
 * match of the words inside one block. Gives null when the words are gone or match more than once.
 */
export function findTarget(doc: ProseMirrorNode, target: Target, sep: string): Target | null {
  const inDoc = target.to <= doc.content.size;
  if (inDoc && doc.textBetween(target.from, target.to, sep, leafText) === target.text) return target;
  // The words moved. A text in one block with one match is still the same words.
  if (target.text === '' || target.text.includes('\n')) return null;
  const found: Target[] = [];
  doc.descendants((node, pos) => {
    if (found.length > 1) return false;
    if (!node.isTextblock) return true;
    let offset = pos + 1;
    let text = '';
    const starts: { at: number; pos: number }[] = [];
    node.forEach((child) => {
      if (child.isText) {
        starts.push({ at: text.length, pos: offset });
        text += child.text ?? '';
      } else text += '\uFFFC';
      offset += child.nodeSize;
    });
    let at = text.indexOf(target.text);
    while (at >= 0 && found.length <= 1) {
      const start = [...starts].reverse().find((s) => s.at <= at);
      if (start) {
        const from = start.pos + (at - start.at);
        found.push({ from, to: from + target.text.length, text: target.text });
      }
      at = text.indexOf(target.text, at + 1);
    }
    return false;
  });
  const only = found.length === 1 ? found[0] : undefined;
  if (!only) return null;
  return doc.textBetween(only.from, only.to, sep, leafText) === target.text ? only : null;
}
