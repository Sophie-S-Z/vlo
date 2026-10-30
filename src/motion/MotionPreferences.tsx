import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { getStoredValue, setStoredValue, subscribeStoredValues } from "@/ui/lib/storedValue";

export const CALM_STORAGE_KEY = "vlo:calm";
const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

export interface MotionPreferences {
  /** The writer's Calm switch. */
  calm: boolean;
  /** The operating system asks for reduced motion. */
  systemReduced: boolean;
  /** True when decorative motion, sound and WebGL must stay off: Calm is on (ADR 0011). */
  reduced: boolean;
  /** The system asks for reduced motion and Calm is off: effects run without the strong ones. */
  gentle: boolean;
  setCalm: (calm: boolean) => void;
}

const MotionPreferencesContext = createContext<MotionPreferences | null>(null);

function subscribeReducedMotion(onChange: () => void): () => void {
  if (typeof window.matchMedia !== "function") return () => {};
  const query = window.matchMedia(REDUCED_MOTION_QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

function getSystemReduced(): boolean {
  return typeof window.matchMedia === "function" && window.matchMedia(REDUCED_MOTION_QUERY).matches;
}

const getCalm = () => getStoredValue(CALM_STORAGE_KEY) === "on";

export function MotionPreferencesProvider({ children }: { children: ReactNode }) {
  // The server snapshot (Calm off) keeps prerendered HTML and hydration in agreement.
  const calm = useSyncExternalStore(subscribeStoredValues, getCalm, () => false);
  const systemReduced = useSyncExternalStore(subscribeReducedMotion, getSystemReduced, () => false);
  // Only Calm stops the effects; a system setting softens them (ADR 0011).
  const reduced = calm;
  const gentle = systemReduced && !calm;

  const setCalm = useCallback((next: boolean) => {
    setStoredValue(CALM_STORAGE_KEY, next ? "on" : "off");
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.motion = reduced ? "reduced" : gentle ? "gentle" : "full";
    root.dataset.calm = calm ? "on" : "off";
  }, [calm, reduced, gentle]);

  const value = useMemo(
    () => ({ calm, systemReduced, reduced, gentle, setCalm }),
    [calm, systemReduced, reduced, gentle, setCalm],
  );

  return (
    <MotionPreferencesContext.Provider value={value}>{children}</MotionPreferencesContext.Provider>
  );
}

export function useMotionPreferences(): MotionPreferences {
  const value = useContext(MotionPreferencesContext);
  if (!value) throw new Error("useMotionPreferences must be used inside MotionPreferencesProvider");
  return value;
}
