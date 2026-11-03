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
  const rest = parts.filter((p) => p !== 'Mod').map((p) => (p === 'Alt' ? 'Alt' : p));
  if (!parts.includes('Mod')) return [...rest, name].join('+');
  return [['Control', ...rest, name].join('+'), ['Meta', ...rest, name].join('+')].join(' ');
}
