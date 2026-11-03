import { safeStorage } from '@/app/preferences';

/* The special characters a writer picked last, newest first, kept on this device. */

const KEY = 'vlo:recent-characters';
const MAX_RECENT = 16;

export function recentCharacters(): string[] {
  try {
    const raw: unknown = JSON.parse(safeStorage()?.getItem(KEY) ?? '[]');
    if (!Array.isArray(raw)) return [];
    return raw
      .filter((v): v is string => typeof v === 'string' && v.length > 0 && v.length <= 8)
      .slice(0, MAX_RECENT);
  } catch {
    return [];
  }
}

export function rememberCharacter(char: string): string[] {
  const next = [char, ...recentCharacters().filter((c) => c !== char)].slice(0, MAX_RECENT);
  try {
    safeStorage()?.setItem(KEY, JSON.stringify(next));
  } catch {
    // Private windows can refuse storage. The list then lasts until the page closes.
  }
  return next;
}
