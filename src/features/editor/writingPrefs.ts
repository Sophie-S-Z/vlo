import { useSyncExternalStore } from 'react';
import { safeStorage } from '@/app/preferences';
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
  /** Comfort spacing on the screen only, in em (letters and words) and in lines. */
  letterSpacing: number;
  wordSpacing: number;
  lineHeight: number;
  /** The style check (F47) marks repeats, filler words, cliches and long sentences. Off until the writer asks. */
  styleCheck: boolean;
}

export type ToolLevel = 'simple' | 'full';

/** The comfort choices: Standard, Wider and Widest. Standard is the editor's own spacing. */
export const LETTER_SPACINGS = [0, 0.05, 0.1] as const;
export const WORD_SPACINGS = [0, 0.1, 0.2] as const;
export const LINE_HEIGHTS = [1.7, 2, 2.3] as const;

function oneOf(list: readonly number[], value: unknown): number {
  return typeof value === 'number' && list.includes(value) ? value : (list[0] ?? 0);
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
};
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
    letterSpacing: oneOf(LETTER_SPACINGS, value.letterSpacing),
    wordSpacing: oneOf(WORD_SPACINGS, value.wordSpacing),
    lineHeight: oneOf(LINE_HEIGHTS, value.lineHeight),
    styleCheck: value.styleCheck === true,
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
  try {
    safeStorage()?.setItem(KEY, JSON.stringify(current));
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
