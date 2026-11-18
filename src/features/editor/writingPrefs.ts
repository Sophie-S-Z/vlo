import { useSyncExternalStore } from 'react';
import { safeStorage } from '@/app/preferences';
import { cleanFontValue, type FontValue } from './format/fonts';
import { cleanZoom } from './format/page';

/*
 * Writing switches on this device. Smart punctuation turns straight quotes into curly quotes, "--" into an
 * em dash, "..." into an ellipsis and similar. It is on for prose. Poems keep every typed character until
 * the poet turns it on, because a poem's punctuation can be deliberate.
 */

export interface WritingPrefs {
  smartProse: boolean;
  smartPoems: boolean;
  /** The equation panel shows the LaTeX under the equation. Off, so a writer never needs to see code. */
  showLatex: boolean;
  /** Page zoom in percent, 80 to 200, on this device (E7). It is separate from the browser's zoom. */
  zoom: number;
  /** The editor draws the aiOrigin mark under AI text (F26). On, so the writer sees each AI word. */
  showAiText: boolean;
  /** Simple shows the phone toolbar at every width, and the More menu holds the other tools (F36). */
  toolLevel: ToolLevel;
  /** Comfort (F37): the screen shows the text in Atkinson Hyperlegible Next. Exports keep the project font. */
  comfortFont: boolean;
  /** Spacing on the screen only, in em (letters and words) and in lines. The editor and Settings set it. */
  letterSpacing: number;
  wordSpacing: number;
  lineHeight: number;
  /** The style check (F47) marks repeats, filler words, cliches and long sentences. Off until the writer asks. */
  styleCheck: boolean;
  /** The continuity check (F66) marks a name near a Codex name and a mention after "Leaves the story". */
  continuityCheck: boolean;
  /** Page look (Phase 19, Task A3), on the screen only: the text column in characters. */
  pageWidth: number;
  /** How paragraphs part on the screen: a gap, a book indent, or a wide gap. */
  paragraphs: ParagraphLook;
  /** A font for the screen only. Null shows the project font. Exports always keep the project font. */
  screenFont: FontValue | null;
  /** The writer's own page looks, at most `MAX_LOOKS`. */
  looks: SavedLook[];
  /** The item outline (Phase 19, Task B1) stays open in the margin, where the window has room for it. */
  outline: boolean;
  /** The mode dialog offers Reader and Drafting next to Pen. Off, so Vlo is a pen until the writer opts in. */
  aiModes: boolean;
  /** Text shortcuts (Phase 19, Task D3): each "type this" becomes "get this" after a space or a mark. */
  shortcuts: TextShortcut[];
  /** The starter list of common typos, such as "teh", in English prose. */
  typoFixes: boolean;
  /** Codex names complete after three letters, and "@" lists them (Phase 19, Task D4). */
  codexCompletion: boolean;
}

export interface TextShortcut {
  /** What the writer types: one word with no space. */
  from: string;
  /** What the shortcut puts in its place. */
  to: string;
  on: boolean;
}

export const MAX_SHORTCUTS = 200;
export const MAX_SHORTCUT_FROM = 32;
export const MAX_SHORTCUT_TO = 500;

/** A shortcut with a word to type and a text to get, or null. */
export function cleanShortcut(value: unknown): TextShortcut | null {
  if (!value || typeof value !== 'object') return null;
  const { from, to, on } = value as Record<string, unknown>;
  if (typeof from !== 'string' || typeof to !== 'string') return null;
  const word = from.trim();
  if (word === '' || word.length > MAX_SHORTCUT_FROM || /\s/.test(word)) return null;
  if (to === '' || to.length > MAX_SHORTCUT_TO || to === word) return null;
  return { from: word, to, on: on !== false };
}

function cleanShortcuts(value: unknown): TextShortcut[] {
  if (!Array.isArray(value)) return [];
  const shortcuts: TextShortcut[] = [];
  for (const entry of value as unknown[]) {
    const shortcut = cleanShortcut(entry);
    if (shortcut && !shortcuts.some((s) => s.from === shortcut.from)) shortcuts.push(shortcut);
  }
  return shortcuts.slice(0, MAX_SHORTCUTS);
}

export type ParagraphLook = 'spaced' | 'indented' | 'airy';
export const PARAGRAPH_LOOKS: readonly ParagraphLook[] = ['spaced', 'indented', 'airy'];

/** The parts of the writing prefs that a page look sets. */
export interface PageLook {
  pageWidth: number;
  paragraphs: ParagraphLook;
  screenFont: FontValue | null;
  lineHeight: number;
}

export interface SavedLook extends PageLook {
  name: string;
}

export const MAX_LOOKS = 6;
export const MAX_LOOK_NAME = 40;
export const PAGE_WIDTH_MIN = 56;
export const PAGE_WIDTH_MAX = 160;
export const PAGE_WIDTH_STEP = 2;
const PAGE_WIDTH_DEFAULT = 100;
/** The page width from before Phase 19, when the details panel kept it under its own key. */
const OLD_WIDTH_KEY = 'vlo:pageWidth';

export type ToolLevel = 'simple' | 'full';

/** The line spacings that Page look names. The Spacing tool sets any line spacing in `SPACING`. */
export const LINE_HEIGHTS = [1.7, 2, 2.3] as const;

export type SpacingKey = 'letterSpacing' | 'wordSpacing' | 'lineHeight';

/**
 * The free range of each spacing on the screen: letters and words in em, lines as a multiple of the font
 * size. The default is the editor's own spacing.
 */
export const SPACING: Readonly<
  Record<SpacingKey, { min: number; max: number; step: number; normal: number }>
> = {
  letterSpacing: { min: -0.05, max: 0.5, step: 0.01, normal: 0 },
  wordSpacing: { min: -0.2, max: 1.5, step: 0.05, normal: 0 },
  lineHeight: { min: 1, max: 4, step: 0.05, normal: 1.7 },
};

/** A spacing in its range, on its step. A value that is not a number gives the default. */
export function cleanSpacing(key: SpacingKey, value: unknown): number {
  const { min, max, step, normal } = SPACING[key];
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) return normal;
  return Number((Math.round(value / step) * step).toFixed(3));
}

const KEY = 'vlo:writing';
export const WRITING_DEFAULTS: WritingPrefs = {
  smartProse: true,
  smartPoems: false,
  showLatex: false,
  zoom: 100,
  showAiText: true,
  // A writer from before tool levels keeps every tool. A new writer starts at Simple (decision P4).
  toolLevel: 'full',
  comfortFont: false,
  letterSpacing: 0,
  wordSpacing: 0,
  lineHeight: 1.7,
  styleCheck: false,
  continuityCheck: false,
  pageWidth: PAGE_WIDTH_DEFAULT,
  paragraphs: 'spaced',
  screenFont: null,
  looks: [],
  outline: false,
  aiModes: false,
  shortcuts: [],
  typoFixes: true,
  codexCompletion: true,
};

/** A page width in the range, on a step; anything else gives null. */
export function cleanPageWidth(value: unknown): number | null {
  return typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= PAGE_WIDTH_MIN &&
    value <= PAGE_WIDTH_MAX
    ? value
    : null;
}

function cleanParagraphs(value: unknown): ParagraphLook {
  return PARAGRAPH_LOOKS.find((look) => look === value) ?? 'spaced';
}

/** The parts of a page look, each cleaned. Null when a part is damaged. */
export function cleanPageLook(value: unknown): PageLook | null {
  if (!value || typeof value !== 'object') return null;
  const look = value as Record<string, unknown>;
  const pageWidth = cleanPageWidth(look.pageWidth);
  const lineHeight = cleanSpacing('lineHeight', look.lineHeight);
  if (pageWidth === null || lineHeight !== look.lineHeight) return null;
  if (!PARAGRAPH_LOOKS.some((p) => p === look.paragraphs)) return null;
  const screenFont = look.screenFont === null ? null : cleanFontValue(look.screenFont);
  if (screenFont === null && look.screenFont !== null) return null;
  return {
    pageWidth,
    paragraphs: cleanParagraphs(look.paragraphs),
    screenFont,
    lineHeight,
  };
}

function cleanLooks(value: unknown): SavedLook[] {
  if (!Array.isArray(value)) return [];
  const looks: SavedLook[] = [];
  for (const entry of value as unknown[]) {
    const look = cleanPageLook(entry);
    const name = (entry as { name?: unknown } | null)?.name;
    if (!look || typeof name !== 'string') continue;
    const clean = name.trim().slice(0, MAX_LOOK_NAME);
    if (clean !== '' && !looks.some((l) => l.name === clean)) looks.push({ name: clean, ...look });
  }
  return looks.slice(0, MAX_LOOKS);
}

/** The page width that the details panel kept before Phase 19, so a writer keeps their width. */
function oldWidth(): number | null {
  try {
    return cleanPageWidth(Number(safeStorage()?.getItem(OLD_WIDTH_KEY)));
  } catch {
    return null;
  }
}
const listeners = new Set<() => void>();

/** The stored switches. A damaged value gives none. */
function stored(): Partial<Record<keyof WritingPrefs, unknown>> {
  try {
    const raw: unknown = JSON.parse(safeStorage()?.getItem(KEY) ?? 'null');
    if (raw && typeof raw === 'object') return raw;
  } catch {
    // A damaged value falls back to the defaults.
  }
  return {};
}

function load(): WritingPrefs {
  const value = stored();
  return {
    smartProse: typeof value.smartProse === 'boolean' ? value.smartProse : WRITING_DEFAULTS.smartProse,
    smartPoems: typeof value.smartPoems === 'boolean' ? value.smartPoems : WRITING_DEFAULTS.smartPoems,
    showLatex: typeof value.showLatex === 'boolean' ? value.showLatex : WRITING_DEFAULTS.showLatex,
    zoom: cleanZoom(value.zoom),
    showAiText: typeof value.showAiText === 'boolean' ? value.showAiText : WRITING_DEFAULTS.showAiText,
    toolLevel: value.toolLevel === 'simple' ? 'simple' : 'full',
    comfortFont: value.comfortFont === true,
    letterSpacing: cleanSpacing('letterSpacing', value.letterSpacing),
    wordSpacing: cleanSpacing('wordSpacing', value.wordSpacing),
    lineHeight: cleanSpacing('lineHeight', value.lineHeight),
    styleCheck: value.styleCheck === true,
    continuityCheck: value.continuityCheck === true,
    pageWidth: cleanPageWidth(value.pageWidth) ?? oldWidth() ?? PAGE_WIDTH_DEFAULT,
    paragraphs: cleanParagraphs(value.paragraphs),
    screenFont: value.screenFont === undefined ? null : cleanFontValue(value.screenFont),
    looks: cleanLooks(value.looks),
    outline: value.outline === true,
    aiModes: value.aiModes === true,
    shortcuts: cleanShortcuts(value.shortcuts),
    typoFixes: value.typoFixes !== false,
    codexCompletion: value.codexCompletion !== false,
  };
}

let current = load();

export function getWritingPrefs(): WritingPrefs {
  return current;
}

/** Called when a new writer ends the welcome: the toolbar starts at Simple, unless a level is stored. */
export function startWithSimpleTools(): void {
  if (stored().toolLevel === undefined) setWritingPrefs({ toolLevel: 'simple' });
}

export function setWritingPrefs(change: Partial<WritingPrefs>): void {
  current = { ...current, ...change, zoom: cleanZoom(change.zoom ?? current.zoom) };
  // Only the switches that the writer set are stored, so a default such as the welcome's Simple tools
  // still applies to the others.
  const kept: Partial<Record<keyof WritingPrefs, unknown>> = { ...stored(), ...change };
  if (change.zoom !== undefined) kept.zoom = current.zoom;
  try {
    safeStorage()?.setItem(KEY, JSON.stringify(kept));
  } catch {
    // Private windows can refuse storage. The switch still works until the page closes.
  }
  for (const listener of listeners) listener();
}

/** Calls the listener after each change to the switches. */
export function subscribeWritingPrefs(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useWritingPrefs(): WritingPrefs {
  return useSyncExternalStore(subscribeWritingPrefs, getWritingPrefs, getWritingPrefs);
}
