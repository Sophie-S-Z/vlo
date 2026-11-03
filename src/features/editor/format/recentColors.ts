import { safeStorage } from '@/app/preferences';
import { parseColor, toHex } from '@/lib/contrast';
import type { SwatchKind } from './palette';

/* The custom colors a writer used last, newest first, kept on this device for each kind of color. */

const MAX_RECENT = 8;

function key(kind: SwatchKind): string {
  return `vlo:recent-colors:${kind}`;
}

export function recentColors(kind: SwatchKind): string[] {
  try {
    const raw: unknown = JSON.parse(safeStorage()?.getItem(key(kind)) ?? '[]');
    if (!Array.isArray(raw)) return [];
    return raw
      .filter((v): v is string => typeof v === 'string' && parseColor(v) !== null)
      .slice(0, MAX_RECENT);
  } catch {
    return [];
  }
}

/** Puts a custom color first in the recent list. Palette colors are not custom, so they never join it. */
export function rememberColor(kind: SwatchKind, value: string): string[] {
  const rgb = parseColor(value);
  if (!rgb) return recentColors(kind);
  const hex = toHex(rgb);
  const next = [hex, ...recentColors(kind).filter((v) => v !== hex)].slice(0, MAX_RECENT);
  try {
    safeStorage()?.setItem(key(kind), JSON.stringify(next));
  } catch {
    // Private windows can refuse storage. The list then lasts until the page closes.
  }
  return next;
}
