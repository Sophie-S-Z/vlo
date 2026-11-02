import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  PREFERENCES_KEY,
  loadPreferences,
  parsePreferences,
  resolveTheme,
  safeStorage,
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
  const [prefs, setPrefs] = useState<Preferences>(() => loadPreferences(safeStorage()));
  const systemDark = useMediaQuery('(prefers-color-scheme: dark)');
  const reducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)');
  const resolvedTheme = resolveTheme(prefs.theme, systemDark);

  // A layout effect, so a theme change inside a view transition is in place before the browser takes the new picture.
  useLayoutEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = resolvedTheme;
    root.dataset.calm = String(prefs.calm);
    // The browser bar takes the theme's page color.
    const background = getComputedStyle(root).getPropertyValue('--bg').trim();
    if (background) document.querySelector('meta[name="theme-color"]')?.setAttribute('content', background);
  }, [resolvedTheme, prefs.calm]);

  // Saves only the writer's own changes, never the first load or a change that came from another tab.
  const dirty = useRef(false);
  useEffect(() => {
    if (!dirty.current) return;
    dirty.current = false;
    savePreferences(safeStorage(), prefs);
  }, [prefs]);

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      // A null key means another tab cleared all site storage, so the defaults apply again.
      if (event.key === null) setPrefs(parsePreferences(null));
      else if (event.key === PREFERENCES_KEY) setPrefs(parsePreferences(event.newValue));
    };
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  const update = useCallback((patch: Partial<Preferences>) => {
    dirty.current = true;
    setPrefs((current) => ({ ...current, ...patch }));
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
