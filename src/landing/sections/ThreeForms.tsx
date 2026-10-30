import { useState } from "react";
import {
  DEMO_MEMOIR,
  DEMO_POEM,
  DEMO_POEM_SYLLABLES,
  DEMO_SCENES,
  FORMS,
  MAGNET_WORDS,
} from "../copy";
import { Eyebrow, Page } from "./Page";

export function ThreeForms() {
  return (
    <Page n={4} id="forms" titleId="forms-title" className="overflow-clip">
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
          <MemoirDemo />
        </Panel>
        <Panel title={FORMS.poetry} label="Poetry">
          <PoetryDemo />
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
                // Centered on (x, y) with margins, not a translate: GSAP reads a translate into
                // its transform cache and would write it back as an inline transform.
                style={board ? { left: `calc(${x}% - 21%)`, top: `${y}%` } : undefined}
                className={
                  "rounded-card border border-rule bg-bg p-3 font-mono text-xs" +
                  (board ? " absolute -mt-6 w-[42%]" : "")
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

function MemoirDemo() {
  return (
    <>
      <p className="font-serif text-lg leading-relaxed">
        {DEMO_MEMOIR.text.map((part, i) =>
          typeof part === "string" ? <span key={i}>{part}</span> : <AliasName key={i} {...part} />,
        )}
      </p>
      <p id="memoir-note" className="mt-2 font-mono text-xs text-muted">
        Marked names change to their aliases in every share and export.
      </p>
      <figure className="mt-6 rounded-card border border-rule bg-bg p-4">
        <figcaption className="font-mono text-[0.65rem] tracking-widest text-muted uppercase">
          In an export
        </figcaption>
        <p className="mt-2 font-serif text-base leading-relaxed">
          {DEMO_MEMOIR.text.map((part) => (typeof part === "string" ? part : part.alias)).join("")}
        </p>
      </figure>
      <ol
        data-timeline
        className="relative mt-8 flex justify-between border-t border-rule pt-3 font-mono text-[0.65rem] text-muted uppercase"
      >
        <span
          aria-hidden="true"
          data-timeline-line
          className="absolute inset-x-0 -top-px h-px origin-left bg-accent"
        />
        {DEMO_MEMOIR.stages.map((stage) => (
          <li key={stage} data-stage>
            {stage}
          </li>
        ))}
      </ol>
    </>
  );
}

/** A marked real name. Click or tap shows the alias; the effect scrambles between them. */
function AliasName({ real, alias }: { real: string; alias: string }) {
  const [hidden, setHidden] = useState(false);
  const shown = hidden ? alias : real;
  return (
    <button
      type="button"
      data-alias-name
      data-real={real}
      data-alias={alias}
      data-text={shown}
      aria-pressed={hidden}
      aria-describedby="memoir-note"
      onClick={() => setHidden((value) => !value)}
      className="cursor-pointer underline decoration-accent decoration-dotted underline-offset-4"
    >
      <span className="sr-only">{shown}</span>
    </button>
  );
}

function PoetryDemo() {
  return (
    <div data-poetry>
      <pre data-testid="poem-text" className="sr-only">
        {DEMO_POEM.join("\n")}
      </pre>
      <div data-poem aria-hidden="true" className="font-serif text-base leading-relaxed">
        {DEMO_POEM.map((line, i) => (
          <div key={i} className="flex min-h-[1lh] items-baseline justify-between gap-4">
            <span data-poem-line className="whitespace-pre">
              {line}
            </span>
            <span data-syllables className="font-mono text-[0.65rem] text-muted tabular-nums">
              {DEMO_POEM_SYLLABLES[i] ?? ""}
            </span>
          </div>
        ))}
      </div>
      <div>
        <p className="mt-6 font-mono text-[0.65rem] tracking-widest text-muted uppercase">
          Magnetic poetry
        </p>
        <ul
          aria-label="Word tiles"
          data-magnets
          className="relative mt-2 flex h-56 flex-wrap content-start gap-1.5 overflow-hidden rounded-card border border-rule bg-bg p-2"
        >
          {MAGNET_WORDS.map((word) => (
            <li
              key={word}
              data-magnet
              className="h-fit rounded-sm border border-rule bg-surface px-2 py-0.5 font-serif text-sm select-none"
            >
              {word}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
