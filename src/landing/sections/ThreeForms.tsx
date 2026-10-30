import { useState } from "react";
import { DEMO_MEMOIR, DEMO_POEM, DEMO_SCENES, FORMS } from "../copy";
import { Eyebrow, Page } from "./Page";

export function ThreeForms() {
  return (
    <Page n={4} id="forms" titleId="forms-title" className="overflow-hidden">
      <div className="mx-auto max-w-6xl">
        <Eyebrow n={4}>Three forms</Eyebrow>
        <h2
          id="forms-title"
          className="mb-16 font-display text-[clamp(2rem,5vw,4rem)] leading-tight"
        >
          {FORMS.title}
        </h2>
      </div>
      <div data-forms-track className="mx-auto grid max-w-6xl gap-6 lg:grid-cols-3">
        <Panel title={FORMS.novel} label="Novel">
          <NovelBoard />
        </Panel>
        <Panel title={FORMS.memoir} label="Memoir">
          <p className="font-serif text-lg leading-relaxed">
            {DEMO_MEMOIR.text.map((part, i) =>
              typeof part === "string" ? (
                <span key={i}>{part}</span>
              ) : (
                <span
                  key={i}
                  data-alias={part.alias}
                  className="underline decoration-accent decoration-dotted underline-offset-4"
                >
                  {part.real}
                </span>
              ),
            )}
          </p>
          <p className="mt-2 font-mono text-xs text-muted">
            Marked names change to their aliases in every share and export.
          </p>
          <ol
            data-timeline
            className="mt-6 flex justify-between border-t border-rule pt-3 font-mono text-[0.65rem] text-muted uppercase"
          >
            {DEMO_MEMOIR.stages.map((stage) => (
              <li key={stage}>{stage}</li>
            ))}
          </ol>
        </Panel>
        <Panel title={FORMS.poetry} label="Poetry">
          <pre
            data-poem
            className="overflow-x-auto font-serif text-base leading-relaxed whitespace-pre"
          >
            {DEMO_POEM.join("\n")}
          </pre>
        </Panel>
      </div>
    </Page>
  );
}

function Panel({
  title,
  label,
  children,
}: {
  title: string;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <article className="rounded-card border border-rule bg-surface p-6">
      <p className="font-mono text-xs tracking-widest text-accent-text uppercase">{label}</p>
      <h3 className="mt-2 mb-6 font-display text-2xl">{title}</h3>
      {children}
    </article>
  );
}

/** Card centers in Board layout, in % of the board. Threads join them in story order. */
const BOARD_POSITIONS: readonly (readonly [x: number, y: number])[] = [
  [24, 18],
  [72, 14],
  [30, 50],
  [74, 46],
  [24, 82],
  [70, 84],
];

function NovelBoard() {
  const [layout, setLayout] = useState<"grid" | "board">("board");
  const board = layout === "board";
  return (
    <div>
      <div role="group" aria-label="Layout" className="mb-4 flex gap-1 font-mono text-xs">
        {(["grid", "board"] as const).map((value) => (
          <button
            key={value}
            type="button"
            data-layout-toggle
            aria-pressed={layout === value}
            onClick={() => setLayout(value)}
            className="rounded-full border border-rule px-3 py-1 capitalize aria-pressed:border-accent aria-pressed:text-accent-text"
          >
            {value === "grid" ? "Grid" : "Board"}
          </button>
        ))}
      </div>
      <div data-novel-board className={board ? "relative h-80" : "relative"}>
        {board && (
          <svg
            aria-hidden="true"
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            className="absolute inset-0 size-full text-accent"
          >
            {BOARD_POSITIONS.slice(1).map(([x2, y2], i) => {
              const [x1, y1] = BOARD_POSITIONS[i]!;
              return (
                <line
                  key={i}
                  data-thread={i}
                  x1={x1}
                  y1={y1}
                  x2={x2}
                  y2={y2}
                  stroke="currentColor"
                  strokeWidth={1}
                  vectorEffect="non-scaling-stroke"
                />
              );
            })}
          </svg>
        )}
        <ul
          aria-label="Scene cards"
          data-novel-cards
          data-layout={layout}
          className={board ? "absolute inset-0" : "grid grid-cols-2 gap-2"}
        >
          {DEMO_SCENES.map((scene, i) => {
            const [x, y] = BOARD_POSITIONS[i]!;
            return (
              <li
                key={scene}
                data-drag-card
                style={board ? { left: `${x}%`, top: `${y}%` } : undefined}
                className={
                  "rounded-card border border-rule bg-bg p-3 font-mono text-xs" +
                  (board ? " absolute w-[42%] -translate-x-1/2 -translate-y-1/2" : "")
                }
              >
                {scene}
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
