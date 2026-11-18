/* Shortcut text in TipTap's form ("Mod-Shift-h") turned into labels and ARIA values. */

export function isApplePlatform(): boolean {
  if (typeof navigator === 'undefined') return false;
  const data = (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData;
  const platform = data?.platform ?? navigator.platform;
  return /mac|iphone|ipad|ipod/i.test(platform);
}

const KEY_NAMES: Record<string, string> = {
  '.': '.',
  ',': ',',
  '\\': '\\',
  '/': '/',
  '[': '[',
  ']': ']',
  Enter: 'Enter',
};

function keyName(key: string): string {
  return KEY_NAMES[key] ?? (key.length === 1 ? key.toUpperCase() : key);
}

/** "Mod-Shift-h" as "⌘⇧H" on Apple devices and "Ctrl+Shift+H" elsewhere. */
export function shortcutLabel(keys: string, apple = isApplePlatform()): string {
  const parts = keys.split(/-(?!$)/);
  const key = parts.pop() ?? '';
  const mods = parts.map((part) => {
    if (part === 'Mod') return apple ? '⌘' : 'Ctrl';
    if (part === 'Shift') return apple ? '⇧' : 'Shift';
    if (part === 'Alt') return apple ? '⌥' : 'Alt';
    return part;
  });
  return apple ? [...mods, keyName(key)].join('') : [...mods, keyName(key)].join('+');
}

/** The `aria-keyshortcuts` value, with both Control and Meta for "Mod". */
export function ariaShortcut(keys: string): string {
  const parts = keys.split(/-(?!$)/);
  const key = parts.pop() ?? '';
  const name = key.length === 1 ? key.toUpperCase() : key;
  const rest = parts.filter((p) => p !== 'Mod').map((p) => (p === 'Ctrl' ? 'Control' : p));
  if (!parts.includes('Mod')) return [...rest, name].join('+');
  return [['Control', ...rest, name].join('+'), ['Meta', ...rest, name].join('+')].join(' ');
}

const MODIFIERS = ['Mod', 'Ctrl', 'Meta', 'Alt', 'Shift'] as const;

/** One form of a key for a comparison: the modifiers in a fixed order and a lowercase letter. */
export function normalKeys(keys: string): string {
  const parts = keys.split(/-(?!$)/);
  const key = parts.pop() ?? '';
  const mods = MODIFIERS.filter((mod) => parts.includes(mod));
  return [...mods, key.length === 1 ? key.toLowerCase() : key].join('-');
}

export function sameKeys(a: string, b: string): boolean {
  return normalKeys(a) === normalKeys(b);
}

const ONLY_MODIFIER = new Set(['Control', 'Meta', 'Alt', 'Shift', 'AltGraph', 'CapsLock', 'OS']);

/**
 * The key that a key press makes, in TipTap's form, or null for a key that is not a shortcut. A shortcut
 * has Mod, Ctrl or Alt, or is an F key, so it never takes a letter that the writer types. A letter or a
 * digit is the one on the key, as the editor reads it, so AZERTY and Dvorak keys work. When Alt changes it
 * to another character, as on a Mac, the key's place on the keyboard gives it.
 */
export function eventKeys(
  event: Pick<KeyboardEvent, 'key' | 'code' | 'metaKey' | 'ctrlKey' | 'altKey' | 'shiftKey'>,
  apple = isApplePlatform(),
): string | null {
  if (ONLY_MODIFIER.has(event.key)) return null;
  const place = /^(?:Key([A-Z])|Digit(\d))$/.exec(event.code);
  const key =
    place && !/^[a-z0-9]$/i.test(event.key) ? (place[1] ?? place[2] ?? '').toLowerCase() : event.key;
  const fKey = /^F\d{1,2}$/.test(key);
  const mod = apple ? event.metaKey : event.ctrlKey;
  const ctrl = apple && event.ctrlKey;
  const meta = !apple && event.metaKey;
  if (!mod && !ctrl && !meta && !event.altKey && !fKey) return null;
  if (key === '' || key === ' ' || key === 'Dead' || key === 'Unidentified') return null;
  const mods = [
    mod && 'Mod',
    ctrl && 'Ctrl',
    meta && 'Meta',
    event.altKey && 'Alt',
    event.shiftKey && 'Shift',
  ].filter((m): m is string => typeof m === 'string');
  return [...mods, key.length === 1 ? key.toLowerCase() : key].join('-');
}

/** Keys that Vlo or the text box needs, so no tool can take them. */
export const KEPT_KEYS: Readonly<Record<string, string>> = {
  'Mod-a': 'Select all',
  'Mod-c': 'Copy',
  'Mod-x': 'Cut',
  'Mod-v': 'Paste',
  'Mod-k': 'the command menu',
  'Alt-F10': 'moving to the tools',
};

/** Keys that a browser uses. A browser can act on some of them before the page sees the key. */
export const BROWSER_KEYS: readonly string[] = [
  'Mod-t',
  'Mod-n',
  'Mod-w',
  'Mod-q',
  'Mod-l',
  'Mod-r',
  'Mod-d',
  'Mod-j',
  'Mod-o',
  'Mod-s',
  'Mod-p',
  'Mod-g',
  'Mod-e',
  'Mod-Shift-t',
  'Mod-Shift-n',
  'Mod-Shift-w',
  'Mod-Shift-g',
  'Mod-Shift-i',
  'Mod-Shift-Delete',
  'Mod-Tab',
  'Mod-Shift-Tab',
  'Mod-=',
  'Mod--',
  'Mod-0',
  ...['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((n) => `Mod-${n}`),
  'Alt-ArrowLeft',
  'Alt-ArrowRight',
  'F1',
  'F3',
  'F5',
  'F6',
  'F11',
  'F12',
];
