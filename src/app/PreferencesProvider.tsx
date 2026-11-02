import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  PREFERENCES_KEY,
  loadPreferences,
  parsePreferences,
  resolveTheme,
  savePreferences,
  type Preferences,
  type ResolvedTheme,
  type ThemeChoice,
} from './preferences';
import { useMediaQuery } from './useMediaQuery';

interface PreferencesContextValue {
  prefs: Preferences;
  resolvedTheme: ResolvedTheme;
  reducedMotion: boolean;
  setTheme: (theme: ThemeChoice) => void;
  setCalm: (on: boolean) => void;
}

const PreferencesContext = createContext<PreferencesContextValue | null>(null);

export function PreferencesProvider({ children }: { children: ReactNode }) {
  const [prefs, setPrefs] = useState<Preferences>(() => loadPreferences(window.localStorage));
  const systemDark = useMediaQuery('(prefers-color-scheme: dark)');
  const reducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)');
  const resolvedTheme = resolveTheme(prefs.theme, systemDark);

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = resolvedTheme;
    root.dataset.calm = String(prefs.calm);
  }, [resolvedTheme, prefs.calm]);

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key === PREFERENCES_KEY) setPrefs(parsePreferences(event.newValue));
    };
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  const update = useCallback((patch: Partial<Preferences>) => {
    setPrefs((current) => {
      const next = { ...current, ...patch };
      savePreferences(window.localStorage, next);
      return next;
    });
  }, []);

  const value = useMemo<PreferencesContextValue>(
    () => ({
      prefs,
      resolvedTheme,
      reducedMotion,
      setTheme: (theme) => {
        update({ theme });
      },
      setCalm: (calm) => {
        update({ calm });
      },
    }),
    [prefs, resolvedTheme, reducedMotion, update],
  );

  return <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>;
}

export function usePreferences(): PreferencesContextValue {
  const value = useContext(PreferencesContext);
  if (!value) throw new Error('usePreferences needs a PreferencesProvider.');
  return value;
}

/** False when Calm mode is on or the system asks for reduced motion. */
export function useMotionAllowed(): boolean {
  const { prefs, reducedMotion } = usePreferences();
  return !prefs.calm && !reducedMotion;
}
