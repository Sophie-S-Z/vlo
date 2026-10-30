import { useEffect, useSyncExternalStore } from "react";
import { soundLevel, soundOn, subscribeSound } from "@/audio/sound";

/**
 * Film grain over the landing page (spec section 17: 4 to 5%, landing and Library only). CSS
 * moves the noise; reduced motion keeps it still. While sound plays, the grain follows the
 * audio level a little (spec 18.1 item 10).
 */
export function Grain() {
  const on = useSyncExternalStore(subscribeSound, soundOn, () => false);

  useEffect(() => {
    if (!on) return;
    const root = document.documentElement.style;
    let frame = 0;
    const follow = () => {
      root.setProperty("--vlo-grain-boost", soundLevel().toFixed(3));
      frame = requestAnimationFrame(follow);
    };
    frame = requestAnimationFrame(follow);
    return () => {
      cancelAnimationFrame(frame);
      root.removeProperty("--vlo-grain-boost");
    };
  }, [on]);

  return (
    <div
      data-grain
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-40 overflow-hidden"
    >
      <div data-grain-noise />
    </div>
  );
}
