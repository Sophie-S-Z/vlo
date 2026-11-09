import JSZip from 'jszip';
import { NODE_MARK } from '@/features/editor/textMap';
import { attr, child, isEquation, W, xml } from './docx';
import { ImportError } from './tree';

/*
 * Reads a Word file that Vlo exported and an editor changed (F45, decision R3). Each item's section starts
 * with the bookmark vlo_<item id>. For each paragraph, Vlo reads its text as it was before the editor's
 * changes, and each tracked change and comment as offsets in that text.
 */

export type ReviewChange =
  | { kind: 'insert'; at: number; text: string; by: string; date: number }
  | { kind: 'delete'; from: number; to: number; by: string; date: number }
  | { kind: 'comment'; from: number; to: number; id: string; text: string; by: string; date: number };

export interface ReviewParagraph {
  /**
   * The text before the changes: the deleted words in, the inserted words out, and one NODE_MARK for each
   * footnote, equation or line break.
   */
  original: string;
  changes: ReviewChange[];
}

export interface Review {
  /** The paragraphs of each section, by the name of its bookmark. */
  sections: Map<string, ReviewParagraph[]>;
  /** True when the file has no Vlo bookmark. */
  foreign: boolean;
}

const NOT_WORD = 'This file is not a Word file. Save it as .docx in Word, then import it.';

type Tracked = { kind: 'insert' | 'delete'; by: string; date: number } | null;

function dateOf(element: Element): number {
  const date = Date.parse(attr(element, 'date') ?? '');
  return Number.isNaN(date) ? 0 : date;
}

function trackedOf(element: Element, kind: 'insert' | 'delete'): Tracked {
  return { kind, by: attr(element, 'author') ?? '', date: dateOf(element) };
}

/** The text of each comment, by its Word id, with its author and date. */
async function commentsOf(zip: JSZip): Promise<Map<string, { text: string; by: string; date: number }>> {
  const doc = await xml(zip, 'word/comments.xml');
  const out = new Map<string, { text: string; by: string; date: number }>();
  for (const comment of Array.from(doc?.getElementsByTagNameNS(W, 'comment') ?? [])) {
    const text = Array.from(comment.getElementsByTagNameNS(W, 'p'))
      .map((p) =>
        Array.from(p.getElementsByTagNameNS(W, 't'))
          .map((t) => t.textContent)
          .join(''),
      )
      .join('\n')
      .trim();
    const id = attr(comment, 'id');
    if (id !== null && text !== '')
      out.set(id, { text, by: attr(comment, 'author') ?? '', date: dateOf(comment) });
  }
  return out;
}

/** True for the framed paragraph that holds a drop cap. Its letter starts the next paragraph. */
function isDropCap(paragraph: Element): boolean {
  const drop = attr(child(child(paragraph, 'pPr'), 'framePr'), 'dropCap');
  return drop !== null && drop !== 'none';
}

export async function readReview(bytes: Uint8Array): Promise<Review> {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(bytes);
  } catch {
    throw new ImportError(NOT_WORD);
  }
  const body = (await xml(zip, 'word/document.xml'))?.getElementsByTagNameNS(W, 'body')[0];
  if (!body) throw new ImportError(NOT_WORD);

  const sections = new Map<string, ReviewParagraph[]>();
  let section: ReviewParagraph[] | null = null;
  let paragraph: ReviewParagraph = { original: '', changes: [] };
  /** The number of the paragraph in the file. */
  let count = 0;
  /** Where each open comment starts in the paragraph, by its Word id. */
  const open = new Map<string, number>();
  /** Where each comment's parts are, so a reply on the same words joins its comment. */
  const anchors = new Map<string, string[]>();

  const commentPart = (id: string, from: number) => {
    const to = paragraph.original.length;
    paragraph.changes.push({ kind: 'comment', from, to, id, text: '', by: '', date: 0 });
    anchors.set(id, [...(anchors.get(id) ?? []), `${String(count)}:${String(from)}:${String(to)}`]);
  };

  const text = (value: string, tracked: Tracked) => {
    if (value === '') return;
    const at = paragraph.original.length;
    const last = paragraph.changes[paragraph.changes.length - 1];
    if (tracked?.kind === 'insert') {
      if (last?.kind === 'insert' && last.at === at && last.by === tracked.by) last.text += value;
      else paragraph.changes.push({ kind: 'insert', at, text: value, by: tracked.by, date: tracked.date });
      return;
    }
    paragraph.original += value;
    if (tracked?.kind !== 'delete') return;
    if (last?.kind === 'delete' && last.to === at && last.by === tracked.by) last.to += value.length;
    else
      paragraph.changes.push({
        kind: 'delete',
        from: at,
        to: at + value.length,
        by: tracked.by,
        date: tracked.date,
      });
  };

  const run = (element: Element, tracked: Tracked) => {
    for (const part of Array.from(element.children)) {
      if (part.namespaceURI !== W) continue;
      const name = part.localName;
      if (name === 't' || name === 'delText') text(part.textContent, tracked);
      else if (name === 'tab') text('\t', tracked);
      // An inserted footnote, equation or break has no place in Vlo's text, so only its words come in.
      else if (['br', 'cr', 'footnoteReference'].includes(name) && tracked?.kind !== 'insert')
        text(NODE_MARK, tracked);
    }
  };

  const inline = (element: Element, tracked: Tracked) => {
    for (const part of Array.from(element.children)) {
      if (part.namespaceURI !== W) {
        if (isEquation(part) && tracked?.kind !== 'insert') text(NODE_MARK, tracked);
        continue;
      }
      const name = part.localName;
      const id = attr(part, 'id') ?? '';
      if (name === 'r') run(part, tracked);
      else if (name === 'ins' || name === 'moveTo') inline(part, trackedOf(part, 'insert'));
      else if (name === 'del' || name === 'moveFrom') inline(part, trackedOf(part, 'delete'));
      else if (name === 'commentRangeStart') open.set(id, paragraph.original.length);
      else if (name === 'commentRangeEnd') {
        const from = open.get(id);
        if (from !== undefined) commentPart(id, from);
        open.delete(id);
      } else if (!name.endsWith('Pr')) inline(part, tracked);
    }
  };

  const walk = (parent: Element) => {
    for (const part of Array.from(parent.children)) {
      if (part.namespaceURI !== W || part.localName === 'tbl' || part.localName.endsWith('Pr')) continue;
      if (part.localName !== 'p') {
        walk(part);
        continue;
      }
      const mark = Array.from(part.getElementsByTagNameNS(W, 'bookmarkStart'))
        .map((b) => attr(b, 'name') ?? '')
        .find((name) => name.startsWith('vlo_'));
      if (mark !== undefined) {
        section = sections.get(mark) ?? [];
        sections.set(mark, section);
      }
      inline(part, null);
      if (isDropCap(part)) continue;
      // A comment that goes on into the next paragraph covers the rest of this one.
      for (const [id, from] of open) {
        commentPart(id, from);
        open.set(id, 0);
      }
      section?.push(paragraph);
      paragraph = { original: '', changes: [] };
      count += 1;
    }
  };
  walk(body);

  // A reply has the same words as its comment, so it joins the comment's text.
  const comments = await commentsOf(zip);
  const texts = new Map<string, { text: string; by: string; date: number }>();
  const first = new Map<string, string>();
  for (const [id, places] of anchors) {
    const comment = comments.get(id);
    if (!comment) continue;
    const key = places.join('|');
    const parent = first.get(key);
    const thread = parent === undefined ? undefined : texts.get(parent);
    if (thread) {
      thread.text += `\n${comment.by || 'Reply'}: ${comment.text}`;
    } else {
      first.set(key, id);
      texts.set(id, { ...comment });
    }
  }
  for (const paragraphs of sections.values()) {
    for (const p of paragraphs) {
      p.changes = p.changes.flatMap((change): ReviewChange[] => {
        if (change.kind !== 'comment') return [change];
        const comment = texts.get(change.id);
        return comment ? [{ ...change, ...comment }] : [];
      });
    }
  }
  return { sections, foreign: sections.size === 0 };
}
