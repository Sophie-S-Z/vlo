import { useEffect, useSyncExternalStore } from "react";
import { useMotionPreferences } from "@/motion/MotionPreferences";
import { disableTilt, enableTilt, subscribeTilt, tiltOn, tiltSupported } from "./tilt";

const never = () => () => {};

/**
 * "Enable motion" (spec 18.1 item 11). CSS shows it on touch screens only. It needs a device
 * with an orientation sensor and full motion; Calm and gentle mode turn the tilt off.
 */
export function TiltButton() {
  const { reduced: calm, gentle } = useMotionPreferences();
  // Gyroscope parallax is strong motion: Calm and gentle mode keep it off (ADR 0011).
  const reduced = calm || gentle;
  const supported = useSyncExternalStore(never, tiltSupported, () => false);
  const on = useSyncExternalStore(subscribeTilt, tiltOn, () => false);

  useEffect(() => {
    if (reduced) disableTilt();
  }, [reduced]);
  // Leaving the landing page stops the sensor; no other page uses the tilt.
  useEffect(() => disableTilt, []);

  if (!supported || reduced) return null;
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={() => (on ? disableTilt() : void enableTilt())}
      className="hidden min-h-11 items-center rounded-full border border-rule px-4 font-mono text-xs tracking-wide uppercase pointer-coarse:inline-flex"
    >
      Enable motion
    </button>
  );
}
