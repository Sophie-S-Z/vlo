import { useRef, type KeyboardEvent, type MouseEvent } from "react";
import { cn } from "@/ui/lib/utils";
import { THEMES, useTheme, type ThemeName } from "./ThemeProvider";

const LABELS: Record<ThemeName, string> = {
  ink: "Ink",
  paper: "Paper",
  night: "Night",
  sepia: "Sepia",
};
const SWATCH: Record<ThemeName, string> = {
  ink: "#0E0D0C",
  paper: "#F5F1E8",
  night: "#121110",
  sepia: "#EFE3CC",
};

/** Radio group of themes with roving focus (arrow keys move and select). */
export function ThemeSwitch({ className }: { className?: string }) {
  const { theme, setTheme } = useTheme();
  const refs = useRef<Partial<Record<ThemeName, HTMLButtonElement | null>>>({});

  function choose(next: ThemeName, event?: MouseEvent<HTMLButtonElement>) {
    const rect = event?.currentTarget.getBoundingClientRect();
    setTheme(
      next,
      rect ? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 } : undefined,
    );
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[event.key];
    if (!step) return;
    event.preventDefault();
    const index = (THEMES.indexOf(theme) + step + THEMES.length) % THEMES.length;
    const next = THEMES[index]!;
    choose(next);
    refs.current[next]?.focus();
  }

  return (
    <div
      role="radiogroup"
      aria-label="Theme"
      onKeyDown={onKeyDown}
      className={cn("inline-flex items-center gap-1", className)}
    >
      {THEMES.map((name) => (
        <button
          key={name}
          ref={(el) => {
            refs.current[name] = el;
          }}
          type="button"
          role="radio"
          aria-checked={theme === name}
          aria-label={LABELS[name]}
          tabIndex={theme === name ? 0 : -1}
          onClick={(event) => choose(name, event)}
          className="grid size-9 place-items-center rounded-full sm:size-11"
        >
          <span
            aria-hidden="true"
            className={cn(
              "block size-4 rounded-full border border-rule",
              theme === name && "ring-2 ring-accent ring-offset-2 ring-offset-bg",
            )}
            style={{ background: SWATCH[name] }}
          />
        </button>
      ))}
    </div>
  );
}
