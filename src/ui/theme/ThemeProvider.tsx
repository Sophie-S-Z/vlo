import {
  createContext,
  useCallback,
  useContext,
  useLayoutEffect,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { flushSync } from "react-dom";
import { useMotionPreferences } from "@/motion/MotionPreferences";
import { getStoredValue, setStoredValue, subscribeStoredValues } from "@/ui/lib/storedValue";

export const THEMES = ["ink", "paper", "night", "sepia"] as const;
export type ThemeName = (typeof THEMES)[number];

/** The landing site and the writing app keep separate theme choices (spec section 16). */
export type ThemeScope = "landing" | "app";
const DEFAULT_THEME: Record<ThemeScope, ThemeName> = { landing: "ink", app: "paper" };

export const themeStorageKey = (scope: ThemeScope) => `vlo:theme:${scope}`;

export interface RevealOrigin {
  x: number;
  y: number;
}

interface ThemeContextValue {
  theme: ThemeName;
  setTheme: (theme: ThemeName, origin?: RevealOrigin) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function isTheme(value: string | null): value is ThemeName {
  return value !== null && (THEMES as readonly string[]).includes(value);
}

type ViewTransitionDocument = Document & {
  startViewTransition?: (update: () => void) => { ready: Promise<void> };
};

/** Circular reveal from the toggle. Runs only where View Transitions exist and motion is allowed. */
function revealFrom(origin: RevealOrigin | undefined, ready: Promise<void>) {
  const x = origin?.x ?? window.innerWidth / 2;
  const y = origin?.y ?? window.innerHeight / 2;
  const radius = Math.hypot(
    Math.max(x, window.innerWidth - x),
    Math.max(y, window.innerHeight - y),
  );
  ready
    .then(() => {
      document.documentElement.animate(
        { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`] },
        {
          duration: 700,
          easing: "cubic-bezier(0.65, 0, 0.35, 1)",
          pseudoElement: "::view-transition-new(root)",
        },
      );
    })
    .catch(() => {
      // A skipped transition still applies the theme.
    });
}

export function ThemeProvider({ scope, children }: { scope: ThemeScope; children: ReactNode }) {
  const { reduced } = useMotionPreferences();
  const fallback = DEFAULT_THEME[scope];
  const getTheme = useCallback(() => {
    const stored = getStoredValue(themeStorageKey(scope));
    return isTheme(stored) ? stored : fallback;
  }, [scope, fallback]);
  // The server snapshot (the scope default) keeps prerendered HTML and hydration in agreement.
  const theme = useSyncExternalStore(subscribeStoredValues, getTheme, () => fallback);

  useLayoutEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  const setTheme = useCallback(
    (next: ThemeName, origin?: RevealOrigin) => {
      const apply = () => {
        flushSync(() => setStoredValue(themeStorageKey(scope), next));
        document.documentElement.dataset.theme = next;
      };
      const doc = document as ViewTransitionDocument;
      if (reduced || typeof doc.startViewTransition !== "function") {
        apply();
        return;
      }
      const transition = doc.startViewTransition(apply);
      revealFrom(origin, transition.ready);
    },
    [reduced, scope],
  );

  const value = useMemo(() => ({ theme, setTheme }), [theme, setTheme]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const value = useContext(ThemeContext);
  if (!value) throw new Error("useTheme must be used inside ThemeProvider");
  return value;
}
