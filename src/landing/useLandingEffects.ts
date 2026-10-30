import { useEffect, type RefObject } from "react";
import { useMotionPreferences } from "@/motion/MotionPreferences";

/**
 * Loads the effects chunk after hydration unless Calm is on, and tears it down when Calm turns
 * on. A change between full and gentle motion restarts the effects (ADR 0011).
 */
export function useLandingEffects(root: RefObject<HTMLElement | null>) {
  const { reduced, gentle } = useMotionPreferences();
  useEffect(() => {
    const element = root.current;
    if (reduced || !element) return;
    let teardown: (() => void) | undefined;
    let cancelled = false;
    // Wait one frame. Hydration renders once with the server's "full motion" snapshot and
    // then re-renders with the real preference; the wait lets that cleanup cancel the import.
    const frame = requestAnimationFrame(() => {
      import("./effects")
        .then(({ startLandingEffects }) => {
          if (!cancelled) teardown = startLandingEffects(element);
        })
        .catch((error: unknown) => {
          // The page is complete without effects; report and carry on.
          console.warn("Landing effects did not start.", error);
        });
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
      teardown?.();
    };
    // The effects read gentle mode from html[data-motion]; listing it here restarts them.
  }, [reduced, gentle, root]);
}
