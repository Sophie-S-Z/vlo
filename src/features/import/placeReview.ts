import type { Mark, MarkType, Node as ProseMirrorNode, NodeType } from '@tiptap/pm/model';
import { Transform } from '@tiptap/pm/transform';
import { diffArrays } from 'diff';
import { COMMENT } from '@/features/editor/format/comment';
import { changeStoredDoc, type StoredTarget } from '@/features/editor/storedDoc';
import { SUGGESTION } from '@/features/editor/format/suggestion';
import { NODE_MARK } from '@/features/editor/textMap';
import { clock } from '@/lib/clock';
import type { Pass } from '@/lib/db';
import { newId } from '@/lib/ids';
import type { ReviewChange, ReviewParagraph } from './review';

/*
 * Puts an editor's Word changes into an item (F45, decision R3). Each Word paragraph goes on the Vlo
 * paragraph with the same text, matched in order. Vlo's text can be in the file with its waiting changes
 * as tracked changes, or as accepted. A change on a paragraph that the writer changed after the export
 * stays out, and the summary lists it. So does a change that Vlo already has.
 */

export const BEFORE_WORD = 'Before Word changes';

export interface Unplaced {
  /** The words of the change, or the comment's text. */
  quote: string;
  reason: 'changed' | 'missing';
}

export interface Placement {
  changes: number;
  comments: number;
  unplaced: Unplaced[];
}

/** A paragraph's text in one reading, with the document position of each character. */
interface Reading {
  text: string;
  at: number[];
}

interface Block {
  node: ProseMirrorNode;
  pos: number;
  /** The position at the end of its content. */
  end: number;
  /** The text with the waiting deletes and without the waiting inserts, as a tracked export has it. */
  original: Reading;
  /** The text as accepted, as an export without tracked changes has it. */
  accepted: Reading;
}

function blocksOf(doc: ProseMirrorNode, suggestion: MarkType): Block[] {
  const blocks: Block[] = [];
  doc.descendants((node, pos) => {
    if (!node.isTextblock) return true;
    const original: Reading = { text: '', at: [] };
    const accepted: Reading = { text: '', at: [] };
    node.forEach((child, offset) => {
      const kind: unknown = suggestion.isInSet(child.marks)?.attrs.kind;
      const chars = child.isText ? (child.text ?? '') : NODE_MARK;
      for (const reading of [kind === 'insert' ? null : original, kind === 'delete' ? null : accepted]) {
        if (!reading) continue;
        reading.text += chars;
        for (let i = 0; i < chars.length; i += 1) reading.at.push(pos + 1 + offset + i);
      }
    });
    blocks.push({ node, pos, end: pos + node.nodeSize - 1, original, accepted });
    return false;
  });
  return blocks;
}

function quoteOf(change: ReviewChange, paragraph: ReviewParagraph): string {
  return change.kind === 'delete' ? paragraph.original.slice(change.from, change.to) : change.text;
}

/** True when every text node from `from` to `to` has a mark that `has` accepts. */
function everyText(doc: ProseMirrorNode, from: number, to: number, has: (marks: readonly Mark[]) => boolean) {
  let all = true;
  doc.nodesBetween(from, to, (node) => {
    if (node.isText && !has(node.marks)) all = false;
    return all;
  });
  return all;
}

/**
 * The transform that puts the changes of `paragraphs` into `doc`, and what it placed. The editor's changes
 * get the suggestion mark of `pass` and the editor's name.
 */
export function placeChanges(
  doc: ProseMirrorNode,
  paragraphs: readonly ReviewParagraph[],
  pass: Pass,
  now: number,
): { tr: Transform; placement: Placement } {
  const schema = doc.type.schema;
  const suggestion = schema.marks[SUGGESTION];
  const comment = schema.marks[COMMENT];
  if (!suggestion || !comment) throw new Error('The editor schema has no suggestion or comment mark.');
  const tr = new Transform(doc);
  const placement: Placement = { changes: 0, comments: 0, unplaced: [] };
  const commentIds = new Map<string, string>();
  const unplacedComments = new Set<string>();
  const unplace = (change: ReviewChange, paragraph: ReviewParagraph, reason: Unplaced['reason']) => {
    if (change.kind === 'comment') {
      if (commentIds.has(change.id) || unplacedComments.has(change.id)) return;
      unplacedComments.add(change.id);
    }
    placement.unplaced.push({ quote: quoteOf(change, paragraph), reason });
  };
  const mark = (kind: 'insert' | 'delete', change: ReviewChange) =>
    suggestion.create({ id: newId(), kind, pass, at: change.date || now, by: change.by });

  /** The editor's inserts placed in the current paragraph, by their offset, as a range in `tr.doc`. */
  let inserted = new Map<number, { from: number; to: number; step: number }>();
  const insert = (pos: number, change: Extract<ReviewChange, { kind: 'insert' }>) => {
    const marks = tr.doc
      .resolve(pos)
      .marks()
      .filter((m) => m.type !== suggestion && m.type !== comment);
    tr.insert(pos, schema.text(change.text, [...marks, mark('insert', change)]));
    inserted.set(change.at, { from: pos, to: pos + change.text.length, step: tr.steps.length });
    placement.changes += 1;
  };
  const addComment = (from: number, to: number, change: Extract<ReviewChange, { kind: 'comment' }>) => {
    const same = (marks: readonly Mark[]) => comment.isInSet(marks)?.attrs.text === change.text;
    // The writer's own comment comes back from the file as it went out.
    if (everyText(tr.doc, from, to, same)) return;
    const id = commentIds.get(change.id) ?? newId();
    if (!commentIds.has(change.id)) placement.comments += 1;
    commentIds.set(change.id, id);
    tr.addMark(from, to, comment.create({ id, text: change.text, at: change.date || now, by: change.by }));
  };
  /** The range of a comment on no words: the editor's insert at that place, or else the whole paragraph. */
  const emptyRange = (offset: number, start: number, end: number): [number, number] => {
    const words = inserted.get(offset);
    if (!words) return [start, end];
    const map = tr.mapping.slice(words.step);
    return [map.map(words.from, 1), map.map(words.to, -1)];
  };

  const place = (block: Block, reading: Reading, paragraph: ReviewParagraph) => {
    const map = (pos: number, assoc: 1 | -1) => tr.mapping.map(pos, assoc);
    const start = (offset: number) => reading.at[offset] ?? block.end;
    const end = (offset: number) => (reading.at[offset - 1] ?? block.pos) + 1;
    for (const change of paragraph.changes) {
      if (change.kind === 'insert') {
        const pos = start(change.at);
        const before = doc.textBetween(Math.max(block.pos + 1, pos - change.text.length), pos);
        const waiting = (marks: readonly Mark[]) => suggestion.isInSet(marks)?.attrs.kind === 'insert';
        // A waiting insert of the writer's came back from the file as an insert.
        if (before === change.text && everyText(doc, pos - change.text.length, pos, waiting)) continue;
        insert(map(pos, 1), change);
      } else if (change.kind === 'delete') {
        const ranges: [number, number][] = [];
        const from = start(change.from);
        const to = end(change.to);
        // Words with a waiting change keep it: a waiting delete is already a delete.
        doc.nodesBetween(from, to, (node, pos) => {
          if (node.isText && !suggestion.isInSet(node.marks))
            ranges.push([Math.max(from, pos), Math.min(to, pos + node.nodeSize)]);
        });
        if (ranges.length === 0) continue;
        for (const [a, b] of ranges) tr.addMark(map(a, 1), map(b, -1), mark('delete', change));
        placement.changes += 1;
      } else {
        const [from, to] =
          change.from === change.to
            ? emptyRange(change.from, map(block.pos + 1, -1), map(block.end, 1))
            : [map(start(change.from), 1), map(end(change.to), -1)];
        if (from < to) addComment(from, to, change);
        else unplace(change, paragraph, 'changed');
      }
    }
  };

  /** A paragraph that the editor added: only inserts, and comments on them. */
  const added = (paragraph: ReviewParagraph) =>
    paragraph.original === '' &&
    paragraph.changes.some((c) => c.kind === 'insert') &&
    paragraph.changes.every((c) => c.kind === 'insert' || (c.kind === 'comment' && c.from === 0));

  /** Puts in a paragraph that the editor added, at `after`, and gives the position after it. */
  const addParagraph = (paragraph: ReviewParagraph, after: number | null, type: NodeType | undefined) => {
    // A new paragraph after a heading is a paragraph.
    const nodeType = type?.name === 'heading' ? schema.nodes.paragraph : type;
    const $at = after === null ? null : tr.doc.resolve(after);
    const first = paragraph.changes.find((c) => c.kind === 'insert');
    if (
      !added(paragraph) ||
      !first ||
      !nodeType ||
      after === null ||
      !$at?.parent.canReplaceWith($at.index(), $at.index(), nodeType)
    ) {
      for (const change of paragraph.changes) unplace(change, paragraph, 'changed');
      return after;
    }
    const text = paragraph.changes.flatMap((c) => (c.kind === 'insert' ? [c.text] : [])).join('');
    const node = nodeType.create(null, schema.text(text, [mark('insert', first)]));
    tr.insert(after, node);
    placement.changes += 1;
    for (const change of paragraph.changes) {
      if (change.kind === 'comment') addComment(after + 1, after + 1 + text.length, change);
    }
    return after + node.nodeSize;
  };

  const blocks = blocksOf(doc, suggestion);
  const keys = blocks.map((b) => [b.original.text, b.accepted.text]);
  const parts = diffArrays(
    keys,
    paragraphs.map((p) => [p.original]),
    { comparator: (a, b) => a.some((text) => b.includes(text)) },
  );
  let old = 0;
  let next = 0;
  /** Where a paragraph that the editor added goes: after the last paragraph matched. */
  let after = blocks[0]?.pos ?? null;
  let type = blocks[0]?.node.type;
  const passed = (block: Block) => {
    after = tr.mapping.map(block.pos + block.node.nodeSize, -1);
    type = block.node.type;
  };
  for (const part of parts) {
    for (let i = 0; i < part.count; i += 1) {
      if (part.removed) {
        // A paragraph that the file does not have. A paragraph that the editor added goes after it.
        const block = blocks[old];
        old += 1;
        if (block) passed(block);
        continue;
      }
      const paragraph = paragraphs[next];
      next += 1;
      if (!paragraph) continue;
      inserted = new Map();
      if (!part.added) {
        const block = blocks[old];
        old += 1;
        if (!block) continue;
        const reading = block.original.text === paragraph.original ? block.original : block.accepted;
        place(block, reading, paragraph);
        passed(block);
      } else if (paragraph.changes.length > 0) {
        after = addParagraph(paragraph, after, type);
      }
    }
  }
  return { tr, placement };
}

/** Everything in `paragraphs` as unplaced, for an item that the file names and the project lacks. */
export function unplacedAll(paragraphs: readonly ReviewParagraph[]): Unplaced[] {
  return paragraphs.flatMap((p) =>
    p.changes.map((c) => ({ quote: quoteOf(c, p), reason: 'missing' as const })),
  );
}

export interface ReviewTarget extends StoredTarget {
  pass: Pass;
}

/**
 * Puts an editor's changes into an item's stored text and into each tab that has it open. A snapshot
 * named "Before Word changes" keeps the text as it was.
 */
export async function placeReview(
  target: ReviewTarget,
  paragraphs: readonly ReviewParagraph[],
): Promise<Placement> {
  // When a newer Vlo saved the item, `change` does not run, and this build places nothing.
  let placement: Placement = { changes: 0, comments: 0, unplaced: unplacedAll(paragraphs) };
  await changeStoredDoc(
    target,
    (doc) => {
      const placed = placeChanges(doc, paragraphs, target.pass, clock.now());
      placement = placed.placement;
      return placed.tr;
    },
    BEFORE_WORD,
  );
  return placement;
}
