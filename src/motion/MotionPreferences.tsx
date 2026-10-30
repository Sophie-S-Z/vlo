import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { readStorage, writeStorage } from "@/ui/lib/storage";

export const CALM_STORAGE_KEY = "vlo:calm";
const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

export interface MotionPreferences {
  /** The writer's Calm switch. */
  calm: boolean;
  /** The operating system asks for reduced motion. */
  systemReduced: boolean;
  /** True when decorative motion, sound and WebGL must stay off. */
  reduced: boolean;
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

export function MotionPreferencesProvider({ children }: { children: ReactNode }) {
  const [calm, setCalmState] = useState(() => readStorage(CALM_STORAGE_KEY) === "on");
  const systemReduced = useSyncExternalStore(subscribeReducedMotion, getSystemReduced, () => false);
  const reduced = calm || systemReduced;

  const setCalm = useCallback((next: boolean) => {
    setCalmState(next);
    writeStorage(CALM_STORAGE_KEY, next ? "on" : "off");
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.motion = reduced ? "reduced" : "full";
    root.dataset.calm = calm ? "on" : "off";
  }, [calm, reduced]);

  const value = useMemo(
    () => ({ calm, systemReduced, reduced, setCalm }),
    [calm, systemReduced, reduced, setCalm],
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
