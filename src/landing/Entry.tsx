import { useEffect, useEffectEvent, useRef, useState, useSyncExternalStore } from "react";
import { chooseSound } from "@/audio/sound";
import { writeStorage } from "@/ui/lib/storage";
import { ENTRY } from "./copy";

export const ENTERED_KEY = "vlo:entered";
/** The curtain opens by itself this long after it shows, once loading ends (ADR 0012). */
export const AUTO_OPEN_MS = 1100;
/** On a slow load, the buttons still show this long before the curtain opens by itself. */
const MIN_BUTTONS_MS = 900;
const SPLIT_MS = 500;

const subscribeNever = () => () => {};
const readEntryFlag = () => document.documentElement.dataset.entry === "first";

/**
 * Entry curtain (spec 18.3 p.00). `public/entry.js` sets `html[data-entry=first]` before the
 * first paint on a first visit with full motion; CSS shows the curtain from that flag, so the
 * prerendered page never flashes. The percentage follows real loading: fonts, the effects
 * chunk and the window load event. The curtain opens by itself after about 1.5 s unless the
 * visitor points at the intro or focuses its buttons. Repeat visits and Calm get no curtain.
 */
export function Entry() {
  // The server snapshot (no curtain) keeps prerendered HTML and hydration in agreement.
  const flagged = useSyncExternalStore(subscribeNever, readEntryFlag, () => false);
  const [closed, setClosed] = useState(false);
  const open = flagged && !closed;
  const [leaving, setLeaving] = useState(false);
  const [progress, setProgress] = useState(0);
  const curtain = useRef<HTMLDivElement>(null);
  const entered = useRef(false);
  const [held, setHeld] = useState(false);
  const [shownAt] = useState(() => (typeof performance === "undefined" ? 0 : performance.now()));

  // Real progress: each finished task moves the counter.
  useEffect(() => {
    if (!open) return;
    const load = new Promise<void>((resolve) => {
      if (document.readyState === "complete") resolve();
      else window.addEventListener("load", () => resolve(), { once: true });
    });
    const tasks = [document.fonts?.ready ?? Promise.resolve(), import("./effects"), load];
    let done = 0;
    let cancelled = false;
    for (const task of tasks) {
      void Promise.resolve(task)
        .catch(() => undefined)
        .then(() => {
          done += 1;
          if (!cancelled) setProgress(Math.round((done / tasks.length) * 100));
        });
    }
    return () => {
      cancelled = true;
    };
  }, [open]);

  // The page behind the curtain is inert until the visitor enters.
  useEffect(() => {
    const element = curtain.current;
    if (!open || !element?.parentElement) return;
    const others = Array.from(element.parentElement.children).filter((child) => child !== element);
    for (const other of others) other.setAttribute("inert", "");
    element.focus();
    return () => {
      for (const other of others) other.removeAttribute("inert");
      // Focus can move only once the page is no longer inert.
      if (entered.current) document.getElementById("main")?.focus({ preventScroll: true });
    };
  }, [open]);

  /** `sound` is the visitor's choice; null keeps the default (sound on the first click). */
  const enter = (sound: boolean | null) => {
    if (leaving) return;
    entered.current = true;
    writeStorage(ENTERED_KEY, "1");
    if (sound !== null) chooseSound(sound);
    setLeaving(true);
    window.setTimeout(() => {
      delete document.documentElement.dataset.entry;
      setClosed(true);
    }, SPLIT_MS);
  };
  const autoEnter = useEffectEvent(() => enter(null));

  // Auto-open: once loading ends and the short intro has played, unless the visitor holds it.
  const loaded = progress >= 100;
  useEffect(() => {
    if (!open || !loaded || held || leaving) return;
    const wait = Math.max(MIN_BUTTONS_MS, AUTO_OPEN_MS - (performance.now() - shownAt));
    const timer = window.setTimeout(autoEnter, wait);
    return () => window.clearTimeout(timer);
  }, [open, loaded, held, leaving, shownAt]);

  return (
    <div
      ref={curtain}
      data-entry-curtain
      data-live={open ? "" : undefined}
      data-leaving={leaving ? "" : undefined}
      data-lenis-prevent
      role={open ? "dialog" : undefined}
      aria-modal={open ? true : undefined}
      aria-label={open ? ENTRY.label : undefined}
      tabIndex={-1}
      onKeyDown={(event) => {
        if (event.key === "Escape") enter(null);
      }}
      className="fixed inset-0 z-[60] flex-col items-center justify-center px-6 text-center outline-none"
    >
      <div
        data-entry-half="top"
        aria-hidden="true"
        className="absolute inset-x-0 top-0 h-1/2 bg-bg"
      />
      <div
        data-entry-half="bottom"
        aria-hidden="true"
        className="absolute inset-x-0 bottom-0 h-1/2 bg-bg"
      />
      <button
        type="button"
        onClick={() => enter(null)}
        className="absolute top-4 right-4 z-10 font-mono text-xs tracking-widest text-muted uppercase underline-offset-4 hover:underline"
      >
        {ENTRY.skip}
      </button>
      <div
        data-entry-body
        onPointerEnter={() => setHeld(true)}
        className="relative z-10 flex flex-col items-center"
      >
        <svg viewBox="0 0 32 32" className="size-16 text-accent" aria-hidden="true">
          <path
            data-entry-logo
            d="M6 7l10 19 10-19"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            pathLength={1}
          />
        </svg>
        <p className="mt-4 font-display text-[clamp(3rem,10vw,7rem)] leading-none">Vlo</p>
        <p
          className="mt-2 font-mono text-xs text-muted tabular-nums"
          role="status"
          aria-label={`Loading ${progress}%`}
        >
          {String(progress).padStart(3, "0")}%
        </p>
        <div className="mt-10 space-y-2 font-serif text-xl sm:text-2xl">
          {ENTRY.lines.map((line) => (
            <p key={line} data-entry-line>
              {line}
            </p>
          ))}
        </div>
        <div
          data-entry-actions
          data-ready={loaded ? "" : undefined}
          onFocus={() => setHeld(true)}
          className="mt-10 flex flex-wrap justify-center gap-3"
        >
          <button
            type="button"
            onClick={() => enter(true)}
            className="min-h-11 rounded-full bg-accent-text px-5 text-sm text-bg"
          >
            {ENTRY.withSound}
          </button>
          <button
            type="button"
            onClick={() => enter(false)}
            className="min-h-11 rounded-full border border-rule px-5 text-sm"
          >
            {ENTRY.silence}
          </button>
        </div>
      </div>
    </div>
  );
}
