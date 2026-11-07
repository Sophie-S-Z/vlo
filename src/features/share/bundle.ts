import type { LatexToMathml } from '@/features/export/latex';
import { parseMathml, type MathNode } from '@/features/export/mathml';
import type { Align, Block, ExportDoc, Run, RunStyle } from '@/features/export/model';
import type { NoteContent } from '@/features/editor/format/notes';

/*
 * The share bundle (spec section 11, plan Task E3): the text that a reader sees, built from the aliased
 * export tree. It keeps the structure, the poem lines and the plain text styles. Fonts, colors and fills
 * stay out, so the reader view uses its own reading styles and has less to check. Each equation goes as a
 * MathML tree, so the reader view never loads MathLive and never parses markup.
 *
 * Anyone with a link can upload any bundle under the same key, so `parseBundle` checks every field before
 * the reader view shows it, and gives null for anything else.
 */

export interface ShareText {
  t: string;
  b?: true;
  i?: true;
  u?: true;
  s?: true;
  sup?: true;
  sub?: true;
  /** An https address. Any other address stays out. */
  link?: string;
}

export type ShareRun = ShareText | { br: true } | { math: MathNode } | { fn: number; note: ShareText[] };

export type ShareBlock =
  | { type: 'p'; runs: ShareRun[]; align?: Align }
  | { type: 'h'; level: 1 | 2 | 3 | 4; runs: ShareRun[]; align?: Align }
  | { type: 'list'; ordered: boolean; start: number; items: ShareBlock[][] }
  | { type: 'quote'; blocks: ShareBlock[] }
  | { type: 'stanza'; lines: { runs: ShareRun[]; hanging: number }[] }
  | { type: 'break' }
  | { type: 'math'; math: MathNode };

export interface ShareSection {
  title: string;
  form: 'prose' | 'poem' | null;
  blocks: ShareBlock[];
}

export interface ShareBundle {
  v: 1;
  title: string;
  author?: string;
  createdAt: number;
  sections: ShareSection[];
}

/** The MathML elements that the reader view draws. Any other element makes the bundle unreadable. */
export const MATH_TAGS: ReadonlySet<string> = new Set([
  'math',
  'mi',
  'mn',
  'mo',
  'ms',
  'mtext',
  'mspace',
  'mrow',
  'mfrac',
  'msqrt',
  'mroot',
  'msup',
  'msub',
  'msubsup',
  'munder',
  'mover',
  'munderover',
  'mtable',
  'mtr',
  'mtd',
  'mstyle',
  'mpadded',
  'mphantom',
  'menclose',
  'semantics',
]);

/** The MathML attributes that the reader view keeps. Others are dropped. */
export const MATH_ATTRS: ReadonlySet<string> = new Set([
  'display',
  'mathvariant',
  'stretchy',
  'fence',
  'separator',
  'lspace',
  'rspace',
  'linethickness',
  'columnalign',
  'notation',
  'accent',
  'accentunder',
  'movablelimits',
  'width',
  'height',
  'depth',
]);

const ALIGNS: readonly Align[] = ['left', 'center', 'right', 'justify'];

/** The most levels of nesting that a bundle may have, so a crafted bundle cannot exhaust the stack. */
const MAX_DEPTH = 24;

/** The most tab stops of a hanging poem line that the reader view shows. */
export const MAX_HANGING = 20;

const hangingOf = (value: number) => Math.min(MAX_HANGING, Math.max(0, value));

// Building, on the writer's device.

function textOf(text: string, style: RunStyle): ShareText {
  return {
    t: text,
    ...(style.bold ? { b: true as const } : {}),
    ...(style.italic ? { i: true as const } : {}),
    ...(style.underline ? { u: true as const } : {}),
    ...(style.strike ? { s: true as const } : {}),
    ...(style.superscript ? { sup: true as const } : {}),
    ...(style.subscript ? { sub: true as const } : {}),
    ...(style.link && safeLink(style.link) ? { link: style.link } : {}),
  };
}

function noteOf(note: NoteContent): ShareText[] {
  return note.map((run) => {
    const has = (mark: string) => run.marks?.some((m) => m.type === mark) === true;
    return textOf(run.text, {
      ...(has('bold') ? { bold: true } : {}),
      ...(has('italic') ? { italic: true } : {}),
      ...(has('underline') ? { underline: true } : {}),
      ...(has('strike') ? { strike: true } : {}),
      ...(has('superscript') ? { superscript: true } : {}),
      ...(has('subscript') ? { subscript: true } : {}),
    });
  });
}

/** The notes that a MathML tree may carry for other programs. The reader view does not need them. */
const NOTE_TAGS: ReadonlySet<string> = new Set(['annotation', 'annotation-xml']);

/**
 * The tree with the allowed elements and attributes only, so that `parseBundle` takes what `toBundle`
 * makes. An element outside the list, or a tree deeper than the limit, gives null.
 */
function cleanMath(node: MathNode, depth: number): MathNode | null {
  if (depth > MAX_DEPTH || !MATH_TAGS.has(node.tag)) return null;
  const attrs: Record<string, string> = {};
  for (const [name, value] of Object.entries(node.attrs)) if (MATH_ATTRS.has(name)) attrs[name] = value;
  const children: MathNode[] = [];
  for (const child of node.children) {
    if (NOTE_TAGS.has(child.tag)) continue;
    const clean = cleanMath(child, depth + 1);
    if (!clean) return null;
    children.push(clean);
  }
  return { tag: node.tag, attrs, text: node.text, children };
}

function mathOf(latex: string, toMathml: LatexToMathml): MathNode | null {
  const xml = toMathml(latex);
  if (xml === '') return null;
  const tree = parseMathml(xml);
  return tree.children.length > 0 ? cleanMath(tree, 0) : null;
}

function runsOf(runs: readonly Run[], toMathml: LatexToMathml): ShareRun[] {
  return runs.map((run): ShareRun => {
    switch (run.type) {
      case 'text':
        return textOf(run.text, run.style);
      case 'break':
        return { br: true };
      case 'math': {
        const math = mathOf(run.latex, toMathml);
        return math ? { math } : { t: run.latex };
      }
      case 'footnote':
        return { fn: run.number, note: noteOf(run.note) };
    }
  });
}

function blockOf(block: Block, toMathml: LatexToMathml): ShareBlock {
  switch (block.type) {
    case 'paragraph':
      return {
        type: 'p',
        runs: runsOf(block.runs, toMathml),
        ...(block.align ? { align: block.align } : {}),
      };
    case 'heading':
      return {
        type: 'h',
        level: block.level,
        runs: runsOf(block.runs, toMathml),
        ...(block.align ? { align: block.align } : {}),
      };
    case 'list':
      return {
        type: 'list',
        ordered: block.ordered,
        start: Math.trunc(block.start),
        items: block.items.map((blocks) => blocks.map((b) => blockOf(b, toMathml))),
      };
    case 'quote':
      return { type: 'quote', blocks: block.blocks.map((b) => blockOf(b, toMathml)) };
    case 'stanza':
      return {
        type: 'stanza',
        lines: block.lines.map((line) => ({
          runs: runsOf(line.runs, toMathml),
          hanging: hangingOf(line.hanging),
        })),
      };
    case 'sceneBreak':
      return { type: 'break' };
    case 'math': {
      const math = mathOf(block.latex, toMathml);
      return math ? { type: 'math', math } : { type: 'p', runs: [{ t: block.latex }] };
    }
  }
}

/** The bundle of an aliased export tree. `toMathml` turns each equation into MathML. */
export function toBundle(doc: ExportDoc, toMathml: LatexToMathml, createdAt: number): ShareBundle {
  return {
    v: 1,
    title: doc.title,
    ...(doc.author ? { author: doc.author } : {}),
    createdAt,
    sections: doc.sections.map((section) => ({
      title: section.title,
      form: section.form,
      blocks: section.blocks.map((b) => blockOf(b, toMathml)),
    })),
  };
}

// Checking, on the reader's device.

/** True for an https address with a host. */
export function safeLink(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.host !== '' && url.username === '' && url.password === '';
  } catch {
    return false;
  }
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const isStr = (v: unknown): v is string => typeof v === 'string';
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

class Invalid extends Error {}

function fail(): never {
  throw new Invalid();
}

function list<T>(value: unknown, item: (v: unknown) => T): T[] {
  if (!Array.isArray(value)) fail();
  return value.map(item);
}

function text(value: unknown): ShareText {
  if (!isObj(value) || !isStr(value.t)) fail();
  const out: ShareText = { t: value.t };
  for (const flag of ['b', 'i', 'u', 's', 'sup', 'sub'] as const) {
    if (value[flag] === undefined) continue;
    if (value[flag] !== true) fail();
    out[flag] = true;
  }
  if (value.link !== undefined) {
    if (!isStr(value.link)) fail();
    // A link that is not https shows as its words only.
    if (safeLink(value.link)) out.link = value.link;
  }
  return out;
}

function math(value: unknown, depth: number): MathNode {
  if (depth > MAX_DEPTH || !isObj(value) || !isStr(value.tag) || !MATH_TAGS.has(value.tag)) fail();
  if (!isStr(value.text) || !isObj(value.attrs)) fail();
  const attrs: Record<string, string> = {};
  for (const [name, attr] of Object.entries(value.attrs)) {
    if (!isStr(attr)) fail();
    if (MATH_ATTRS.has(name)) attrs[name] = attr;
  }
  return {
    tag: value.tag,
    attrs,
    text: value.text,
    children: list(value.children, (c) => math(c, depth + 1)),
  };
}

function run(value: unknown): ShareRun {
  if (!isObj(value)) fail();
  if ('br' in value) {
    if (value.br !== true) fail();
    return { br: true };
  }
  if ('math' in value) return { math: math(value.math, 0) };
  if ('fn' in value) {
    if (!isNum(value.fn) || !Number.isInteger(value.fn) || value.fn < 1) fail();
    return { fn: value.fn, note: list(value.note, text) };
  }
  return text(value);
}

function align(value: unknown): { align?: Align } {
  if (value === undefined) return {};
  if (!ALIGNS.includes(value as Align)) fail();
  return { align: value as Align };
}

function block(value: unknown, depth: number): ShareBlock {
  if (depth > MAX_DEPTH || !isObj(value)) fail();
  switch (value.type) {
    case 'p':
      return { type: 'p', runs: list(value.runs, run), ...align(value.align) };
    case 'h': {
      const level = value.level;
      if (level !== 1 && level !== 2 && level !== 3 && level !== 4) fail();
      return { type: 'h', level, runs: list(value.runs, run), ...align(value.align) };
    }
    case 'list':
      if (typeof value.ordered !== 'boolean' || !isNum(value.start)) fail();
      return {
        type: 'list',
        ordered: value.ordered,
        start: Math.trunc(value.start),
        items: list(value.items, (blocks) => list(blocks, (b) => block(b, depth + 1))),
      };
    case 'quote':
      return { type: 'quote', blocks: list(value.blocks, (b) => block(b, depth + 1)) };
    case 'stanza':
      return {
        type: 'stanza',
        lines: list(value.lines, (line) => {
          if (!isObj(line) || !isNum(line.hanging)) fail();
          return { runs: list(line.runs, run), hanging: hangingOf(line.hanging) };
        }),
      };
    case 'break':
      return { type: 'break' };
    case 'math':
      return { type: 'math', math: math(value.math, 0) };
    default:
      return fail();
  }
}

function section(value: unknown): ShareSection {
  if (!isObj(value) || !isStr(value.title)) fail();
  const form = value.form;
  if (form !== 'prose' && form !== 'poem' && form !== null) fail();
  return { title: value.title, form, blocks: list(value.blocks, (b) => block(b, 0)) };
}

/** The bundle, checked field by field, or null when any part is not a bundle that Vlo makes. */
export function parseBundle(value: unknown): ShareBundle | null {
  try {
    if (!isObj(value) || value.v !== 1 || !isStr(value.title) || !isNum(value.createdAt)) fail();
    if (value.author !== undefined && !isStr(value.author)) fail();
    return {
      v: 1,
      title: value.title,
      ...(isStr(value.author) ? { author: value.author } : {}),
      createdAt: value.createdAt,
      sections: list(value.sections, section),
    };
  } catch (problem) {
    if (problem instanceof Invalid || problem instanceof RangeError) return null;
    throw problem;
  }
}

/** The plain text of some runs, for a comment's quote. */
export function runsText(runs: readonly ShareRun[]): string {
  return runs
    .map((r) => ('t' in r ? r.t : 'br' in r ? ' ' : ''))
    .join('')
    .replace(/\s+/g, ' ')
    .trim();
}

/** The first 12 words of a block, for the place of a comment. */
export function blockQuote(item: ShareBlock): string {
  const all = (b: ShareBlock): string => {
    switch (b.type) {
      case 'p':
      case 'h':
        return runsText(b.runs);
      case 'stanza':
        return b.lines.map((l) => runsText(l.runs)).join(' ');
      case 'quote':
        return b.blocks.map(all).join(' ');
      case 'list':
        return b.items.flat().map(all).join(' ');
      case 'break':
        return '';
      case 'math':
        return '';
    }
  };
  return all(item).split(/\s+/).filter(Boolean).slice(0, 12).join(' ');
}
