import type { JSONContent } from '@tiptap/core';
import * as Y from 'yjs';
import { parseFill } from '@/features/editor/format/fill';
import { cleanFontValue } from '@/features/editor/format/fonts';
import { cleanLatex } from '@/features/editor/format/math';
import { parseNote } from '@/features/editor/format/notes';
import { resolveColor } from '@/features/editor/format/palette';
import { personIdOf, PRIVATE_NAME } from '@/features/people/markName';
import { CITE, citeText } from '@/features/editor/format/cite';
import { AI_ORIGIN, aiLabelOf } from '@/features/editor/format/aiOrigin';
import { SUGGESTION } from '@/features/editor/format/suggestion';
import { COMMENT } from '@/features/editor/format/comment';
import { CAPITAL_ROLES, SCRIPT_LINE, scriptRole, type ScriptRole } from '@/features/editor/scriptRoles';
import { YFRAGMENT } from '@/lib/ydocs';
import {
  NO_REVIEW,
  type Align,
  type Block,
  type ExportForm,
  type ExportReview,
  type PoemLine,
  type Run,
  type RunStyle,
  type TextChange,
  type TextComment,
} from './model';

/*
 * Reads an item's Yjs document into export blocks. This file runs in the export worker, so it uses no
 * editor, no schema and no DOM: it reads the Yjs XML the same way the editor's sync plugin writes it.
 */

/** A mark that a Yjs text can hold more than once carries a hash after its name. */
const HASHED_MARK = /(.*)(--[a-zA-Z0-9+/=]{8})$/;

/** The ProseMirror JSON of a Yjs XML fragment, as @tiptap/y-tiptap writes it. */
export function fragmentToJson(fragment: Y.XmlFragment): JSONContent {
  const serialize = (item: Y.XmlElement | Y.XmlText | Y.XmlHook): JSONContent[] => {
    if (item instanceof Y.XmlText) {
      return (item.toDelta() as { insert: unknown; attributes?: Record<string, Record<string, unknown>> }[])
        .filter((d) => typeof d.insert === 'string')
        .map((d) => {
          const text: JSONContent = { type: 'text', text: d.insert as string };
          if (d.attributes) {
            text.marks = Object.keys(d.attributes).map((name) => {
              const attrs = d.attributes?.[name] ?? {};
              const mark: { type: string; attrs?: Record<string, unknown> } = {
                type: HASHED_MARK.exec(name)?.[1] ?? name,
              };
              if (Object.keys(attrs).length > 0) mark.attrs = attrs;
              return mark;
            });
          }
          return text;
        });
    }
    if (item instanceof Y.XmlElement) {
      const node: JSONContent = { type: item.nodeName };
      const attrs = item.getAttributes() as Record<string, unknown>;
      if (Object.keys(attrs).length > 0) node.attrs = attrs;
      const children = item.toArray();
      if (children.length > 0) node.content = children.flatMap(serialize);
      return [node];
    }
    return [];
  };
  return { type: 'doc', content: fragment.toArray().flatMap(serialize) };
}

/** The ProseMirror JSON of an item's Yjs update. */
export function updateToJson(update: Uint8Array): JSONContent {
  const doc = new Y.Doc();
  try {
    Y.applyUpdate(doc, update);
    return fragmentToJson(doc.getXmlFragment(YFRAGMENT));
  } finally {
    doc.destroy();
  }
}

/** Gives each footnote its number in the whole export, from 1. */
export interface NoteCounter {
  next: () => number;
}

export function noteCounter(): NoteCounter {
  let n = 0;
  return { next: () => (n += 1) };
}

const ALIGNS: readonly Align[] = ['left', 'center', 'right', 'justify'];

function align(attrs: Record<string, unknown> | undefined): Align | undefined {
  const value = attrs?.textAlign;
  // Left is the default, so a block that says left needs no attribute in any format.
  return ALIGNS.find((a) => a === value && a !== 'left');
}

/** A size such as "1.25em" as a number. Other units and out-of-range values are dropped. */
function emSize(value: unknown): number | undefined {
  if (typeof value !== 'string') return undefined;
  const match = /^(\d+(?:\.\d+)?)em$/.exec(value.trim());
  if (!match) return undefined;
  const size = Number(match[1]);
  return size >= 0.5 && size <= 4 ? size : undefined;
}

/** A stored color as #rrggbb for the Paper theme, or undefined when it is not a color Vlo can read. */
function hexColor(value: unknown): string | undefined {
  if (typeof value !== 'string' || value.trim() === '') return undefined;
  const plain = resolveColor(value, 'paper').trim().toLowerCase();
  if (/^#[0-9a-f]{6}$/.test(plain)) return plain;
  const short = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/.exec(plain);
  if (short)
    return `#${short[1] ?? ''}${short[1] ?? ''}${short[2] ?? ''}${short[2] ?? ''}${short[3] ?? ''}${short[3] ?? ''}`;
  const rgb = /^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})/.exec(plain);
  if (rgb) {
    return `#${[rgb[1], rgb[2], rgb[3]].map((c) => Math.min(255, Number(c)).toString(16).padStart(2, '0')).join('')}`;
  }
  return undefined;
}

function safeLink(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:' || url.protocol === 'mailto:'
      ? url.href
      : undefined;
  } catch {
    return undefined;
  }
}

function styleOf(marks: JSONContent['marks']): RunStyle {
  const style: RunStyle = {};
  for (const mark of marks ?? []) {
    const attrs = mark.attrs ?? {};
    switch (mark.type) {
      case 'bold':
        style.bold = true;
        break;
      case 'italic':
        style.italic = true;
        break;
      case 'underline':
        style.underline = true;
        break;
      case 'strike':
        style.strike = true;
        break;
      case 'superscript':
        style.superscript = true;
        break;
      case 'subscript':
        style.subscript = true;
        break;
      case 'highlight': {
        // A highlight with no color is the yellow swatch, as in the editor.
        const color = hexColor(attrs.color ?? 'var(--vlo-mark-yellow)');
        if (color) style.highlight = color;
        break;
      }
      case 'textStyle': {
        const color = hexColor(attrs.color);
        if (color) style.color = color;
        const size = emSize(attrs.fontSize);
        if (size !== undefined && size !== 1) style.size = size;
        const font = cleanFontValue(attrs.font);
        if (font !== null) style.font = font;
        break;
      }
      case 'textFill': {
        const fill = parseFill(attrs.fill);
        if (fill) style.fill = fill;
        break;
      }
      case 'link': {
        const href = safeLink(attrs.href);
        if (href) style.link = href;
        break;
      }
      default:
        break;
    }
  }
  return style;
}

/** The person id of a private-name mark on the text, or null. */
function personOf(marks: JSONContent['marks']): string | null {
  const mark = marks?.find((m) => m.type === PRIVATE_NAME);
  return mark ? personIdOf(mark.attrs) : null;
}

/** The provider and model of an aiOrigin mark on the text, or null. */
function aiOf(marks: JSONContent['marks']): string | null {
  const mark = marks?.find((m) => m.type === AI_ORIGIN);
  return mark ? aiLabelOf(mark.attrs ?? {}) : null;
}

/**
 * The suggestion of a text, or null. Exports take the text as accepted (decision R2), so a deleted word
 * is left out, unless a Word export keeps the changes as tracked changes (F45).
 */
function changeOf(marks: JSONContent['marks']): TextChange | null {
  const attrs = marks?.find((m) => m.type === SUGGESTION)?.attrs;
  const kind: unknown = attrs?.kind;
  if (!attrs || (kind !== 'insert' && kind !== 'delete')) return null;
  const at = Number(attrs.at);
  return { kind, by: String(attrs.by ?? ''), at: Number.isFinite(at) ? at : 0 };
}

/** The writer's comment on a text, or null (F43). Only a Word export with comments on reads it. */
function commentOf(marks: JSONContent['marks']): TextComment | null {
  const attrs = marks?.find((m) => m.type === COMMENT)?.attrs;
  if (typeof attrs?.id !== 'string' || typeof attrs.text !== 'string' || attrs.text.trim() === '')
    return null;
  const at = Number(attrs.at);
  return { id: attrs.id, text: attrs.text, by: String(attrs.by ?? ''), at: Number.isFinite(at) ? at : 0 };
}

function inlineRuns(content: JSONContent[] | undefined, notes: NoteCounter, review: ExportReview): Run[] {
  const runs: Run[] = [];
  for (const node of content ?? []) {
    const change = changeOf(node.marks);
    if (change?.kind === 'delete' && !review.changes) continue;
    if (node.type === 'text' && typeof node.text === 'string' && node.text !== '') {
      const person = personOf(node.marks);
      const ai = aiOf(node.marks);
      const comment = review.comments ? commentOf(node.marks) : null;
      runs.push({
        type: 'text',
        text: node.text,
        style: styleOf(node.marks),
        ...(person === null ? {} : { person }),
        ...(ai === null ? {} : { ai }),
        ...(change && review.changes ? { change } : {}),
        ...(comment ? { comment } : {}),
      });
    } else if (node.type === 'hardBreak') {
      runs.push({ type: 'break' });
    } else if (node.type === 'mathInline') {
      const latex = cleanLatex(node.attrs?.latex);
      if (latex.trim() !== '') runs.push({ type: 'math', latex, style: styleOf(node.marks) });
    } else if (node.type === 'footnote') {
      runs.push({ type: 'footnote', number: notes.next(), note: parseNote(node.attrs?.content) });
    } else if (node.type === CITE) {
      const attrs = node.attrs ?? {};
      runs.push({
        type: 'text',
        text: citeText(attrs),
        style: styleOf(node.marks),
        cite: { key: String(attrs.key ?? ''), page: String(attrs.page ?? '') },
      });
    }
  }
  return runs;
}

function lineSpacing(value: unknown): number | undefined {
  const n = Number(value);
  return [1, 1.15, 1.5, 2].includes(n) ? n : undefined;
}

/** Where a script line sits in an export with no script layout, such as a Word file. */
const ROLE_ALIGN: Partial<Record<ScriptRole, Align>> = {
  character: 'center',
  parenthetical: 'center',
  transition: 'right',
};

function proseBlocks(content: JSONContent[] | undefined, notes: NoteCounter, review: ExportReview): Block[] {
  const blocks: Block[] = [];
  for (const node of content ?? []) {
    const attrs = node.attrs;
    switch (node.type) {
      case 'paragraph': {
        const block: Block = { type: 'paragraph', runs: inlineRuns(node.content, notes, review) };
        const a = align(attrs);
        if (a) block.align = a;
        const spacing = lineSpacing(attrs?.lineSpacing);
        if (spacing !== undefined) block.lineSpacing = spacing;
        if (attrs?.firstLineIndent === true) block.firstLineIndent = true;
        if (attrs?.dropCap === true) block.dropCap = true;
        blocks.push(block);
        break;
      }
      case 'heading': {
        // The text's own headings sit under the item title, so level 2 in the editor is level 3 here.
        const level = Number(attrs?.level) === 3 ? 4 : 3;
        const block: Block = { type: 'heading', level, runs: inlineRuns(node.content, notes, review) };
        const a = align(attrs);
        if (a) block.align = a;
        blocks.push(block);
        break;
      }
      case 'bulletList':
      case 'orderedList': {
        const start = Number(attrs?.start);
        blocks.push({
          type: 'list',
          ordered: node.type === 'orderedList',
          start: Number.isInteger(start) && start > 0 ? start : 1,
          items: (node.content ?? [])
            .filter((child) => child.type === 'listItem')
            .map((child) => proseBlocks(child.content, notes, review)),
        });
        break;
      }
      case 'blockquote':
        blocks.push({ type: 'quote', blocks: proseBlocks(node.content, notes, review) });
        break;
      case 'sceneBreak':
        blocks.push({ type: 'sceneBreak' });
        break;
      case SCRIPT_LINE: {
        const role = scriptRole(attrs?.role);
        let runs = inlineRuns(node.content, notes, review);
        if (CAPITAL_ROLES.has(role))
          runs = runs.map((run) => (run.type === 'text' ? { ...run, text: run.text.toUpperCase() } : run));
        const a = ROLE_ALIGN[role];
        blocks.push({ type: 'paragraph', runs, role, ...(a ? { align: a } : {}) });
        break;
      }
      case 'mathBlock': {
        const latex = cleanLatex(attrs?.latex);
        if (latex.trim() !== '') blocks.push({ type: 'math', latex });
        break;
      }
      default:
        break;
    }
  }
  return blocks;
}

function poemBlocks(content: JSONContent[] | undefined, notes: NoteCounter, review: ExportReview): Block[] {
  const blocks: Block[] = [];
  for (const stanza of content ?? []) {
    if (stanza.type !== 'stanza') continue;
    const lines: PoemLine[] = (stanza.content ?? [])
      .filter((line) => line.type === 'poemLine')
      .map((line) => {
        const hanging = Number(line.attrs?.hanging);
        return {
          runs: inlineRuns(line.content, notes, review),
          hanging: Number.isFinite(hanging) && hanging > 0 ? Math.min(hanging, 20) : 0,
        };
      });
    blocks.push({ type: 'stanza', lines });
  }
  return blocks;
}

/** The blocks of one item. Empty trailing paragraphs and stanzas are dropped. */
export function itemBlocks(
  json: JSONContent,
  form: ExportForm,
  notes: NoteCounter,
  review: ExportReview = NO_REVIEW,
): Block[] {
  const blocks =
    form === 'poem' ? poemBlocks(json.content, notes, review) : proseBlocks(json.content, notes, review);
  while (blocks.length > 0 && isEmpty(blocks[blocks.length - 1])) blocks.pop();
  return blocks;
}

function isEmpty(block: Block | undefined): boolean {
  if (!block) return true;
  if (block.type === 'paragraph') return block.runs.length === 0;
  if (block.type === 'stanza') return block.lines.every((line) => line.runs.length === 0);
  return false;
}
