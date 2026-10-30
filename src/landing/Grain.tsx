import { useEffect, useRef, useSyncExternalStore } from "react";
import { soundLevel, soundOn, subscribeSound } from "@/audio/sound";

/**
 * Film grain over the landing page (spec section 17: 4 to 5%, landing and Library only). CSS
 * moves the noise; reduced motion keeps it still. While sound plays, the grain follows the
 * audio level a little (spec 18.1 item 10).
 */
export function Grain() {
  const on = useSyncExternalStore(subscribeSound, soundOn, () => false);
  const layer = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const style = layer.current?.style;
    if (!on || !style) return;
    // Only this layer restyles, and only when the level moves enough to see.
    let frame = 0;
    let shown = -1;
    const follow = () => {
      const level = Math.round(soundLevel() * 20) / 20;
      if (level !== shown) style.setProperty("--vlo-grain-boost", String((shown = level)));
      frame = requestAnimationFrame(follow);
    };
    frame = requestAnimationFrame(follow);
    return () => {
      cancelAnimationFrame(frame);
      style.removeProperty("--vlo-grain-boost");
    };
  }, [on]);

  return (
    <div
      ref={layer}
      data-grain
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-40 overflow-hidden"
    >
      <div data-grain-noise />
    </div>
  );
}
