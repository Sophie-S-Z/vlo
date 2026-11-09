/*
 * The 20 Vlo fonts and the writer's own fonts (plan Task A7, decision 7). Every Vlo font has its
 * @font-face rules in `styles/fonts.css`, and the browser fetches a font file only when text uses it, so
 * each font loads on first use. The service worker keeps a fetched font for offline use.
 */

export type FontGroup =
  'Book serifs' | 'Display' | 'Sans' | 'Typewriter' | 'Handwriting' | 'Reading-friendly';

export const FONT_GROUPS: readonly FontGroup[] = [
  'Book serifs',
  'Reading-friendly',
  'Display',
  'Sans',
  'Typewriter',
  'Handwriting',
];

export interface VloFont {
  id: string;
  /** The name the writer sees. */
  label: string;
  group: FontGroup;
  /** The CSS family name from the font's @font-face rules. */
  family: string;
  /** The generic family the browser uses until the font arrives. */
  fallback: 'serif' | 'sans-serif' | 'monospace' | 'cursive';
  /** True when the font has its own italic. Without one, the browser slants the upright letters. */
  italic: boolean;
}

/** The manuscript font when the writer picks none. */
export const DEFAULT_FONT = 'newsreader';
/** The font of the comfort switch in Settings (F37, decision P5). */
export const COMFORT_FONT: FontValue = 'atkinson';

export const VLO_FONTS: readonly VloFont[] = [
  {
    id: 'newsreader',
    label: 'Newsreader',
    group: 'Book serifs',
    family: 'Newsreader Variable',
    fallback: 'serif',
    italic: true,
  },
  {
    id: 'eb-garamond',
    label: 'EB Garamond',
    group: 'Book serifs',
    family: 'EB Garamond Variable',
    fallback: 'serif',
    italic: true,
  },
  {
    id: 'libre-baskerville',
    label: 'Libre Baskerville',
    group: 'Book serifs',
    family: 'Libre Baskerville Variable',
    fallback: 'serif',
    italic: true,
  },
  {
    id: 'lora',
    label: 'Lora',
    group: 'Book serifs',
    family: 'Lora Variable',
    fallback: 'serif',
    italic: true,
  },
  {
    id: 'crimson-pro',
    label: 'Crimson Pro',
    group: 'Book serifs',
    family: 'Crimson Pro Variable',
    fallback: 'serif',
    italic: true,
  },
  {
    id: 'cormorant-garamond',
    label: 'Cormorant Garamond',
    group: 'Book serifs',
    family: 'Cormorant Garamond Variable',
    fallback: 'serif',
    italic: true,
  },
  {
    id: 'spectral',
    label: 'Spectral',
    group: 'Book serifs',
    family: 'Spectral',
    fallback: 'serif',
    italic: true,
  },
  {
    id: 'atkinson',
    label: 'Atkinson Hyperlegible Next',
    group: 'Reading-friendly',
    family: 'Atkinson Hyperlegible Next Variable',
    fallback: 'sans-serif',
    italic: true,
  },
  {
    id: 'literata',
    label: 'Literata',
    group: 'Reading-friendly',
    family: 'Literata Variable',
    fallback: 'serif',
    italic: true,
  },
  {
    id: 'merriweather',
    label: 'Merriweather',
    group: 'Reading-friendly',
    family: 'Merriweather Variable',
    fallback: 'serif',
    italic: true,
  },
  {
    id: 'fraunces',
    label: 'Fraunces',
    group: 'Display',
    family: 'Fraunces Variable',
    fallback: 'serif',
    italic: true,
  },
  {
    id: 'playfair-display',
    label: 'Playfair Display',
    group: 'Display',
    family: 'Playfair Display Variable',
    fallback: 'serif',
    italic: true,
  },
  {
    id: 'cinzel',
    label: 'Cinzel',
    group: 'Display',
    family: 'Cinzel Variable',
    fallback: 'serif',
    italic: false,
  },
  {
    id: 'im-fell-english',
    label: 'IM Fell English',
    group: 'Display',
    family: 'IM Fell English',
    fallback: 'serif',
    italic: true,
  },
  {
    id: 'inter',
    label: 'Inter',
    group: 'Sans',
    family: 'Inter Variable',
    fallback: 'sans-serif',
    italic: true,
  },
  {
    id: 'nunito',
    label: 'Nunito',
    group: 'Sans',
    family: 'Nunito Variable',
    fallback: 'sans-serif',
    italic: true,
  },
  {
    id: 'courier-prime',
    label: 'Courier Prime',
    group: 'Typewriter',
    family: 'Courier Prime',
    fallback: 'monospace',
    italic: true,
  },
  {
    id: 'jetbrains-mono',
    label: 'JetBrains Mono',
    group: 'Typewriter',
    family: 'JetBrains Mono',
    fallback: 'monospace',
    italic: false,
  },
  {
    id: 'caveat',
    label: 'Caveat',
    group: 'Handwriting',
    family: 'Caveat Variable',
    fallback: 'cursive',
    italic: false,
  },
  { id: 'kalam', label: 'Kalam', group: 'Handwriting', family: 'Kalam', fallback: 'cursive', italic: false },
];

const byId = new Map(VLO_FONTS.map((f) => [f.id, f]));

export function vloFont(id: string): VloFont | undefined {
  return byId.get(id);
}

/** A stored font value: a Vlo font id, or "local:" and the name of a font installed on the writer's device. */
export type FontValue = string;

const LOCAL = 'local:';
export const MAX_FONT_NAME = 100;

/** A font name as the writer typed or the browser listed it, without characters that can break CSS. */
export function cleanFontName(name: string): string {
  return name
    .replace(/["'\\;{}<>]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_FONT_NAME);
}

/** The stored value for a font installed on the writer's device. */
export function localFont(name: string): FontValue | null {
  const clean = cleanFontName(name);
  return clean === '' ? null : `${LOCAL}${clean}`;
}

/** The installed font's name when `value` names one, else null. */
export function localFontName(value: FontValue): string | null {
  if (!value.startsWith(LOCAL)) return null;
  const name = cleanFontName(value.slice(LOCAL.length));
  return name === '' ? null : name;
}

/** A stored value Vlo can show, or null for anything else. */
export function cleanFontValue(value: unknown): FontValue | null {
  if (typeof value !== 'string') return null;
  if (byId.has(value)) return value;
  const name = localFontName(value);
  return name === null ? null : `${LOCAL}${name}`;
}

/** Vlo's own manuscript font list, for an installed font that the browser cannot find. */
export const BASE_STACK = "'Newsreader Variable', Georgia, serif";

/**
 * The CSS font-family list for a stored value. An installed font falls back to `fallback`: the project's
 * font inside the text, or Vlo's own font for the project font itself.
 */
export function fontStack(value: FontValue, fallback = 'var(--font-manuscript)'): string {
  const font = byId.get(value);
  if (font) return `'${font.family}', ${font.fallback}`;
  const name = localFontName(value);
  return name === null ? fallback : `'${name}', ${fallback}`;
}

/** The name the writer sees for a stored value. */
export function fontLabel(value: FontValue): string {
  return byId.get(value)?.label ?? localFontName(value) ?? 'Default';
}
