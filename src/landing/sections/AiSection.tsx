import { useRef, useState } from "react";
import { AI_MODES, AI_SECTION } from "../copy";
import { Eyebrow, Page } from "./Page";

type Mode = (typeof AI_MODES)[number];

export function AiSection() {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState<Mode | null>(null);

  function show(mode: Mode) {
    setOpen(mode);
    dialogRef.current?.showModal();
  }

  return (
    <Page n={6} id="ai" titleId="ai-title" className="mx-auto max-w-6xl">
      <Eyebrow n={6}>AI on your terms</Eyebrow>
      <h2 id="ai-title" className="font-display text-[clamp(2rem,5vw,4rem)] leading-tight">
        {AI_SECTION.title}
      </h2>
      <p className="mt-4 max-w-prose font-serif text-xl text-muted">{AI_SECTION.intro}</p>
      <ul className="mt-12 grid gap-4 md:grid-cols-3">
        {AI_MODES.map((mode) => (
          <li key={mode.id}>
            <button
              type="button"
              data-tilt
              onClick={() => show(mode)}
              aria-haspopup="dialog"
              className="group relative block h-full w-full rounded-card border border-rule bg-surface p-6 text-left transition-shadow hover:shadow-lg"
            >
              <span className="font-mono text-xs tracking-widest text-accent-text uppercase">
                {mode.id === "pen" ? "Default" : "Opt-in"}
              </span>
              <span className="mt-3 block font-display text-3xl">{mode.name}</span>
              <span className="mt-3 block font-serif text-lg text-muted">{mode.summary}</span>
              <span className="mt-6 block font-mono text-xs underline underline-offset-4">
                Read more
              </span>
            </button>
          </li>
        ))}
      </ul>
      <dialog
        ref={dialogRef}
        aria-labelledby="ai-dialog-title"
        onClose={() => setOpen(null)}
        className="m-auto w-[min(92vw,36rem)] rounded-card border border-rule bg-surface p-8 text-fg backdrop:bg-black/60"
      >
        {open && (
          <>
            <h3 id="ai-dialog-title" className="font-display text-3xl">
              {open.name}
            </h3>
            <p className="mt-4 font-serif text-lg">{open.detail}</p>
            <form method="dialog" className="mt-8">
              <button
                className="min-h-11 rounded-full border border-rule px-5 font-mono text-xs uppercase"
                autoFocus
              >
                Close
              </button>
            </form>
          </>
        )}
      </dialog>
    </Page>
  );
}
