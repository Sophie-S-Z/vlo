import type { Align } from '@/features/export/model';
import { cleanFontValue, fontStack, type FontValue } from './fonts';

/*
 * Paragraph styles with names (Phase 19, Task E2). A project keeps its styles in its settings, and a
 * paragraph names its style in the `styleId` attribute. The text follows each change of a style, because
 * the editor draws each style from one style sheet. A format that the writer gives a paragraph directly
 * wins over its style, as in Word.
 */

export interface ParagraphStyle {
  id: string;
  name: string;
  /** A Vlo font id, or "local:" and an installed font's name. The project font when absent. */
  font?: FontValue;
  /** The size as a multiple of the text size, such as 0.9. */
  size?: number;
  align?: Align;
  /** The space at the start of each line, in em of the text size. */
  indent?: number;
  /** The space above and below the paragraph, in em of the text size. */
  before?: number;
  after?: number;
  italic?: true;
}

/** The parts of a style that make its look. */
export type StyleLook = Omit<ParagraphStyle, 'id' | 'name'>;

export const MAX_STYLES = 40;
export const MAX_STYLE_NAME = 40;
const STYLE_ID = /^[a-z0-9-]{1,40}$/;
const ALIGNS: readonly Align[] = ['left', 'center', 'right', 'justify'];
/** The smallest and the largest value of each number. */
export const STYLE_LIMITS = {
  size: [0.5, 3],
  indent: [0, 10],
  before: [0, 6],
  after: [0, 6],
} as const satisfies Record<string, readonly [number, number]>;

/** The styles that a project starts with. */
export const DEFAULT_PARAGRAPH_STYLES: readonly ParagraphStyle[] = [
  { id: 'epigraph', name: 'Epigraph', italic: true, indent: 4, after: 1.5 },
  { id: 'letter', name: 'Letter', indent: 2, before: 0.5, after: 0.5 },
  {
    id: 'text-message',
    name: 'Text message',
    font: 'inter',
    size: 0.9,
    indent: 2,
    before: 0.25,
    after: 0.25,
  },
  { id: 'song-lyrics', name: 'Song lyrics', italic: true, align: 'center', before: 0.5, after: 0.5 },
  { id: 'sign', name: 'Sign', font: 'inter', size: 0.9, align: 'center', before: 1, after: 1 },
];

/** A style id from storage or a document, or null. */
export function cleanStyleId(value: unknown): string | null {
  return typeof value === 'string' && STYLE_ID.test(value) ? value : null;
}

/** A new id for a style, which no default style has. */
export function newStyleId(): string {
  return `s-${crypto.randomUUID().slice(0, 8)}`;
}

function inRange(value: unknown, [min, max]: readonly [number, number]): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
}

/** A style from storage, or null when any part of it is wrong. */
function cleanStyle(value: unknown): ParagraphStyle | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Record<string, unknown>;
  const id = cleanStyleId(v.id);
  const name = typeof v.name === 'string' ? v.name.trim() : '';
  if (id === null || name === '' || name.length > MAX_STYLE_NAME) return null;
  const style: ParagraphStyle = { id, name };
  if (v.font !== undefined) {
    const font = cleanFontValue(v.font);
    if (font === null) return null;
    style.font = font;
  }
  for (const key of ['size', 'indent', 'before', 'after'] as const) {
    if (v[key] === undefined) continue;
    if (!inRange(v[key], STYLE_LIMITS[key])) return null;
    style[key] = v[key];
  }
  if (v.align !== undefined) {
    if (!(ALIGNS as readonly unknown[]).includes(v.align)) return null;
    style.align = v.align as Align;
  }
  if (v.italic !== undefined) {
    if (v.italic !== true) return null;
    style.italic = true;
  }
  return style;
}

/**
 * The good styles of a stored list, each id once, at most `MAX_STYLES`. Null when the value is not a list.
 * A backup check compares the lengths, so it refuses a file with a damaged style.
 */
export function cleanParagraphStyles(value: unknown): ParagraphStyle[] | null {
  if (!Array.isArray(value)) return null;
  const seen = new Set<string>();
  const out: ParagraphStyle[] = [];
  for (const entry of value) {
    const style = cleanStyle(entry);
    if (!style || seen.has(style.id)) continue;
    seen.add(style.id);
    out.push(style);
  }
  return out.slice(0, MAX_STYLES);
}

/** A project's styles: its own list, or the default styles until the writer changes one. */
export function stylesOf(stored: unknown): readonly ParagraphStyle[] {
  return cleanParagraphStyles(stored) ?? DEFAULT_PARAGRAPH_STYLES;
}

/**
 * The CSS of a style, as property and value. Margins are in em of the text size, so each margin is
 * divided by the style's own size.
 */
export function styleDeclarations(
  style: StyleLook,
  family: (font: FontValue) => string = fontStack,
): [string, string][] {
  const size = style.size ?? 1;
  const em = (n: number) => `${String(Math.round((n / size) * 1000) / 1000)}em`;
  const out: [string, string][] = [];
  if (style.font) out.push(['font-family', family(style.font)]);
  if (style.size !== undefined) out.push(['font-size', `${String(style.size)}em`]);
  if (style.align) out.push(['text-align', style.align]);
  if (style.indent !== undefined) out.push(['margin-inline-start', em(style.indent)]);
  if (style.before !== undefined) out.push(['margin-top', em(style.before)]);
  if (style.after !== undefined) out.push(['margin-bottom', em(style.after)]);
  if (style.italic) out.push(['font-style', 'italic']);
  return out;
}

/** One rule for each style, for the paragraphs under `scope`. */
export function styleSheet(styles: readonly ParagraphStyle[], scope: string): string {
  return styles
    .map((style) => {
      const body = styleDeclarations(style)
        .map(([property, value]) => `${property}: ${value};`)
        .join(' ');
      return body === '' ? '' : `${scope} p[data-style='${style.id}'] { ${body} }`;
    })
    .filter((rule) => rule !== '')
    .join('\n');
}
