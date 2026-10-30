import { useId } from "react";
import { cn } from "@/ui/lib/utils";
import { useMotionPreferences } from "./MotionPreferences";

/** Calm turns off decorative motion, sound and WebGL (spec F08). */
export function CalmSwitch({ className }: { className?: string }) {
  const { calm, systemReduced, setCalm } = useMotionPreferences();
  const hintId = useId();
  return (
    <>
      {systemReduced && (
        <span id={hintId} className="sr-only">
          Your system already asks for reduced motion.
        </span>
      )}
      <button
        type="button"
        role="switch"
        data-calm-control
        aria-checked={calm}
        onClick={() => setCalm(!calm)}
        aria-describedby={systemReduced ? hintId : undefined}
        className={cn(
          "inline-flex min-h-9 items-center gap-2 rounded-full px-2 font-mono sm:min-h-11 sm:px-3 text-xs tracking-wide uppercase",
          className,
        )}
      >
        <span
          aria-hidden="true"
          className={cn(
            "relative inline-block h-4 w-7 rounded-full border border-current transition-colors",
            calm && "bg-accent border-accent",
          )}
        >
          <span
            className={cn(
              "absolute top-1/2 left-0.5 size-2.5 -translate-y-1/2 rounded-full bg-current transition-transform ease-vlo",
              calm && "translate-x-3 bg-bg",
            )}
          />
        </span>
        Calm
      </button>
    </>
  );
}
