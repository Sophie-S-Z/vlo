import { useSyncExternalStore } from "react";
import { getStoredValue, setStoredValue, subscribeStoredValues } from "@/ui/lib/storedValue";
import { useMotionPreferences } from "./MotionPreferences";

export const CALM_OFFER_KEY = "vlo:calm-offer";

const offerSeen = () => getStoredValue(CALM_OFFER_KEY) === "seen";

/**
 * Gentle mode notice (ADR 0011). When the system asks for reduced motion, the page keeps
 * gentle motion and offers Calm with one tap. It shows once per device.
 */
export function CalmOffer() {
  const { gentle, setCalm } = useMotionPreferences();
  // The server snapshot (seen) keeps prerendered HTML and hydration in agreement.
  const seen = useSyncExternalStore(subscribeStoredValues, offerSeen, () => true);
  if (!gentle || seen) return null;

  const close = (calm: boolean) => {
    setStoredValue(CALM_OFFER_KEY, "seen");
    if (calm) setCalm(true);
    // The offer disappears with the focused button; focus returns to the page.
    document.getElementById("main")?.focus({ preventScroll: true });
  };

  return (
    <section
      aria-label="Motion"
      data-calm-control
      className="fixed bottom-4 left-4 z-40 max-w-xs rounded-card border border-rule bg-surface p-4 text-sm shadow-lg"
    >
      <p className="font-serif text-base">
        Your device asks for less motion. This page keeps its motion gentle.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => close(true)}
          className="min-h-11 rounded-full bg-accent-text px-4 font-mono text-xs tracking-wide text-bg uppercase"
        >
          Turn on Calm
        </button>
        <button
          type="button"
          onClick={() => close(false)}
          className="min-h-11 rounded-full border border-rule px-4 font-mono text-xs tracking-wide uppercase"
        >
          Keep motion
        </button>
      </div>
    </section>
  );
}
