import { useState } from "react";
import { AI_MODES, PRIVACY } from "../copy";
import { LockArt } from "../art/LockArt";
import { Eyebrow, Page } from "./Page";

type ModeId = (typeof AI_MODES)[number]["id"];

/** Badge icons per mode, in one 24 x 24 box; the effect morphs between them. */
const MODE_ICONS: Record<ModeId, string> = {
  pen: "M12 2C15 7 18 9.5 18 13.5L12 22 6 13.5C6 9.5 9 7 12 2Z",
  reader: "M2 12C5 6 9 4 12 4S19 6 22 12C19 18 15 20 12 20S5 18 2 12Z",
  cowriter: "M12 2L14.5 9.5 22 12 14.5 14.5 12 22 9.5 14.5 2 12 9.5 9.5Z",
};

export function PrivacySection() {
  const [mode, setMode] = useState<ModeId>("pen");
  const index = AI_MODES.findIndex((m) => m.id === mode);
  const current = AI_MODES[index]!;
  return (
    <Page n={5} id="privacy" titleId="privacy-title" className="mx-auto max-w-6xl">
      <Eyebrow n={5}>Privacy</Eyebrow>
      <div className="grid items-center gap-12 md:grid-cols-[1fr_auto]">
        <div>
          <h2
            id="privacy-title"
            className="font-display text-[clamp(2rem,5vw,4rem)] leading-tight text-balance"
          >
            {PRIVACY.title}
          </h2>

          <div className="mt-10 max-w-md">
            <div
              role="radiogroup"
              aria-label="Writing mode"
              data-mode-switch
              className="relative grid grid-cols-3 rounded-full border border-rule p-1"
            >
              <span
                aria-hidden="true"
                data-mode-marker
                className="absolute inset-y-1 left-1 w-[calc((100%-0.5rem)/3)] rounded-full bg-accent-text"
                style={{ translate: `${index * 100}% 0` }}
              />
              {AI_MODES.map((m) => (
                <label key={m.id} className="relative cursor-pointer">
                  <input
                    type="radio"
                    name="ai-mode"
                    value={m.id}
                    checked={mode === m.id}
                    onChange={() => setMode(m.id)}
                    className="peer sr-only"
                  />
                  <span className="flex min-h-11 items-center justify-center rounded-full text-sm transition-colors peer-checked:text-bg peer-focus-visible:outline-2 peer-focus-visible:outline-accent">
                    {m.name}
                  </span>
                </label>
              ))}
            </div>
            <p
              data-testid="mode-badge"
              aria-live="polite"
              className="mt-4 flex items-center gap-3 font-mono text-sm"
            >
              <svg viewBox="0 0 24 24" className="size-6 shrink-0 text-accent" aria-hidden="true">
                <path data-mode-icon d={MODE_ICONS[mode]} fill="currentColor" />
              </svg>
              <span>{current.summary}</span>
            </p>
          </div>

          <p className="mt-8 font-mono text-sm text-muted">
            Requests to Vlo servers in any mode:{" "}
            <span
              data-odometer
              className="inline-block overflow-hidden align-bottom text-fg tabular-nums"
            >
              <span data-testid="vlo-requests" className="inline-block">
                0
              </span>
            </span>
          </p>
          <p data-flashlight className="mt-10 max-w-xl font-serif text-2xl">
            {PRIVACY.hidden}
          </p>
        </div>
        <LockArt />
      </div>
    </Page>
  );
}
