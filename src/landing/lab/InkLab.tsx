import { useEffect, useRef, useSyncExternalStore } from "react";
import { inkLabOpen, setInkLabOpen, subscribeInkLabOpen } from "./settings";

const typing = (target: EventTarget | null) =>
  target instanceof HTMLElement &&
  (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName));

/**
 * Hidden "Ink lab" (spec 18.1 item 12): "~" or the footer button opens a small panel for the
 * particle count, ink color, grain and bloom. Escape closes it and returns focus.
 */
export function InkLab() {
  const open = useSyncExternalStore(subscribeInkLabOpen, inkLabOpen, () => false);
  const panel = useRef<HTMLDivElement>(null);
  const body = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "~" && !typing(event.target)) setInkLabOpen(!inkLabOpen());
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      setInkLabOpen(false);
    };
  }, []);

  useEffect(() => {
    const container = body.current;
    if (!open || !container) return;
    const returnTo = document.activeElement as HTMLElement | null;
    panel.current?.focus();
    let dispose: (() => void) | undefined;
    let closed = false;
    void import("./panel")
      .then(({ createPanel }) => {
        if (!closed) dispose = createPanel(container);
      })
      .catch((error: unknown) => console.warn("The Ink lab did not load.", error));
    return () => {
      closed = true;
      dispose?.();
      if (returnTo?.isConnected) returnTo.focus();
    };
  }, [open]);

  if (!open) return null;
  return (
    <div
      ref={panel}
      role="region"
      aria-label="Ink lab"
      tabIndex={-1}
      data-ink-lab
      data-lenis-prevent
      onKeyDown={(event) => event.key === "Escape" && setInkLabOpen(false)}
      className="fixed right-4 bottom-4 z-50 w-72 rounded-card border border-rule bg-surface p-2 shadow-lg outline-none"
    >
      <div ref={body} />
      <button
        type="button"
        onClick={() => setInkLabOpen(false)}
        className="mt-2 min-h-11 w-full rounded-full border border-rule font-mono text-xs uppercase"
      >
        Close Ink lab
      </button>
    </div>
  );
}
