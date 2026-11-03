import { safeStorage } from '@/app/preferences';
import { parseFill, type TextFill } from './fill';

/* Fills the writer saved by name in the gradient editor, kept on this device. */

const KEY = 'vlo:saved-looks';
export const MAX_SAVED_LOOKS = 24;

export interface SavedLook {
  name: string;
  fill: TextFill;
}

export function savedLooks(): SavedLook[] {
  try {
    const raw: unknown = JSON.parse(safeStorage()?.getItem(KEY) ?? '[]');
    if (!Array.isArray(raw)) return [];
    const out: SavedLook[] = [];
    for (const entry of raw) {
      if (!entry || typeof entry !== 'object') continue;
      const { name, fill } = entry as { name?: unknown; fill?: unknown };
      const clean = parseFill(fill);
      if (typeof name === 'string' && name.trim() !== '' && clean)
        out.push({ name: name.trim().slice(0, 40), fill: clean });
    }
    return out.slice(0, MAX_SAVED_LOOKS);
  } catch {
    return [];
  }
}

function write(looks: SavedLook[]): SavedLook[] {
  try {
    safeStorage()?.setItem(KEY, JSON.stringify(looks));
  } catch {
    // Private windows can refuse storage. The looks then last until the page closes.
  }
  return looks;
}

/** Saves a look by name. A look with the same name is replaced. Newest first. */
export function saveLook(name: string, fill: TextFill): SavedLook[] {
  const clean = name.trim().slice(0, 40);
  if (clean === '') return savedLooks();
  return write(
    [{ name: clean, fill }, ...savedLooks().filter((l) => l.name !== clean)].slice(0, MAX_SAVED_LOOKS),
  );
}

export function removeLook(name: string): SavedLook[] {
  return write(savedLooks().filter((l) => l.name !== name));
}
