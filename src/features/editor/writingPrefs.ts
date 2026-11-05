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
}

const KEY = 'vlo:writing';
export const WRITING_DEFAULTS: WritingPrefs = {
  smartProse: true,
  smartPoems: false,
  showLatex: false,
  zoom: 100,
  showAiText: true,
};
const listeners = new Set<() => void>();

function load(): WritingPrefs {
  try {
    const raw: unknown = JSON.parse(safeStorage()?.getItem(KEY) ?? 'null');
    if (raw && typeof raw === 'object') {
      const value = raw as Partial<Record<keyof WritingPrefs, unknown>>;
      return {
        smartProse: typeof value.smartProse === 'boolean' ? value.smartProse : WRITING_DEFAULTS.smartProse,
        smartPoems: typeof value.smartPoems === 'boolean' ? value.smartPoems : WRITING_DEFAULTS.smartPoems,
        showLatex: typeof value.showLatex === 'boolean' ? value.showLatex : WRITING_DEFAULTS.showLatex,
        zoom: cleanZoom(value.zoom),
        showAiText: typeof value.showAiText === 'boolean' ? value.showAiText : WRITING_DEFAULTS.showAiText,
      };
    }
  } catch {
    // A damaged value falls back to the defaults.
  }
  return WRITING_DEFAULTS;
}

let current = load();

export function getWritingPrefs(): WritingPrefs {
  return current;
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

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useWritingPrefs(): WritingPrefs {
  return useSyncExternalStore(subscribe, getWritingPrefs, getWritingPrefs);
}

/** For tests: read the stored value again. */
export function reloadWritingPrefs(): void {
  current = load();
  for (const listener of listeners) listener();
}
