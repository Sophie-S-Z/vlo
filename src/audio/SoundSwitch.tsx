import { useEffect, useId, useRef, useSyncExternalStore } from "react";
import { useMotionPreferences } from "@/motion/MotionPreferences";
import { cn } from "@/ui/lib/utils";
import { armSound, chooseSound, setSound, soundLevel, soundOn, subscribeSound } from "./sound";

const BARS = [0.55, 1, 0.75, 0.4];

/**
 * Sound switch with four level bars (spec 18.1 item 10). Sound starts on the first click or key
 * press unless the visitor turned it off (ADR 0012). Calm keeps sound off.
 */
export function SoundSwitch({ className }: { className?: string }) {
  const { reduced } = useMotionPreferences();
  const on = useSyncExternalStore(subscribeSound, soundOn, () => false);
  const hintId = useId();
  const bars = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (reduced) {
      setSound(false);
      return;
    }
    return armSound();
  }, [reduced]);

  // The bars follow the audio level while sound plays.
  useEffect(() => {
    const element = bars.current;
    if (!on || !element) return;
    let frame = 0;
    const draw = () => {
      const level = soundLevel();
      Array.from(element.children).forEach((bar, i) => {
        (bar as HTMLElement).style.transform =
          `scaleY(${(0.25 + level * BARS[i]! * 0.75).toFixed(3)})`;
      });
      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(frame);
      for (const bar of Array.from(element.children))
        (bar as HTMLElement).style.removeProperty("transform");
    };
  }, [on]);

  return (
    <>
      {reduced && (
        <span id={hintId} className="sr-only">
          Calm keeps sound off.
        </span>
      )}
      <button
        type="button"
        role="switch"
        aria-checked={on}
        data-sound-switch
        disabled={reduced}
        aria-describedby={reduced ? hintId : undefined}
        onClick={() => chooseSound(!on)}
        className={cn(
          "inline-flex min-h-9 items-center gap-2 rounded-full px-2 font-mono text-xs tracking-wide uppercase disabled:opacity-60 sm:min-h-11 sm:px-3",
          className,
        )}
      >
        <span ref={bars} aria-hidden="true" className="flex h-3.5 items-end gap-0.5">
          {BARS.map((height, i) => (
            <span
              key={i}
              className={cn(
                "block w-0.5 origin-bottom rounded-full",
                on ? "bg-accent" : "bg-current",
              )}
              style={{ height: "100%", scale: on ? undefined : `1 ${height * 0.5}` }}
            />
          ))}
        </span>
        Sound
      </button>
    </>
  );
}
