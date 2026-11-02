export type ThemeChoice = 'system' | 'ink' | 'paper' | 'sepia';
export type ResolvedTheme = 'ink' | 'paper' | 'sepia';

export interface Preferences {
  theme: ThemeChoice;
  calm: boolean;
}

export const PREFERENCES_KEY = 'vlo:preferences';
export const THEME_CHOICES: readonly ThemeChoice[] = ['system', 'ink', 'paper', 'sepia'];
export const DEFAULT_PREFERENCES: Preferences = { theme: 'system', calm: false };

function isThemeChoice(value: unknown): value is ThemeChoice {
  return typeof value === 'string' && (THEME_CHOICES as readonly string[]).includes(value);
}

/** Parses stored preferences. Bad or missing values fall back to the defaults. */
export function parsePreferences(raw: string | null): Preferences {
  if (raw === null) return { ...DEFAULT_PREFERENCES };
  try {
    const data: unknown = JSON.parse(raw);
    if (typeof data !== 'object' || data === null) return { ...DEFAULT_PREFERENCES };
    const record = data as Record<string, unknown>;
    return {
      theme: isThemeChoice(record.theme) ? record.theme : DEFAULT_PREFERENCES.theme,
      calm: typeof record.calm === 'boolean' ? record.calm : DEFAULT_PREFERENCES.calm,
    };
  } catch {
    return { ...DEFAULT_PREFERENCES };
  }
}

/**
 * Returns window.localStorage, or null when the browser blocks site data.
 * In that case the getter itself throws a SecurityError.
 */
export function safeStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function loadPreferences(storage: Storage | null): Preferences {
  if (!storage) return { ...DEFAULT_PREFERENCES };
  try {
    return parsePreferences(storage.getItem(PREFERENCES_KEY));
  } catch {
    return { ...DEFAULT_PREFERENCES };
  }
}

export function savePreferences(storage: Storage | null, prefs: Preferences): void {
  if (!storage) return;
  try {
    storage.setItem(PREFERENCES_KEY, JSON.stringify(prefs));
  } catch {
    // Storage can be full or blocked (private windows). Preferences then last for this tab only.
  }
}

export function resolveTheme(choice: ThemeChoice, systemDark: boolean): ResolvedTheme {
  if (choice === 'system') return systemDark ? 'ink' : 'paper';
  return choice;
}
