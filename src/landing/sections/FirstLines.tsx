import { Fragment } from "react";
import { FIRST_LINES, FIRST_LINES_SECTION } from "../copy";
import { Eyebrow, Page } from "./Page";

export function FirstLines() {
  return (
    <Page n={8} id="first-lines" titleId="first-lines-title" className="overflow-hidden">
      <div className="mx-auto max-w-6xl">
        <Eyebrow n={8}>First lines</Eyebrow>
        <h2
          id="first-lines-title"
          className="font-display text-[clamp(2rem,5vw,4rem)] leading-tight"
        >
          {FIRST_LINES_SECTION.title}
        </h2>
      </div>
      <ul
        aria-label="First lines"
        data-first-lines
        className="mx-auto mt-12 grid max-w-6xl gap-3 sm:grid-cols-2 lg:grid-cols-3"
      >
        {FIRST_LINES.map((item, i) => (
          <Fragment key={item.source}>
            <LineCard {...item} />
            {i % 4 === 3 && <BlankCard />}
          </Fragment>
        ))}
      </ul>
      <div
        aria-hidden="true"
        className="mt-16 space-y-3 font-display text-4xl text-muted italic sm:text-6xl"
      >
        <Marquee words={FIRST_LINES_SECTION.marqueeA} />
        <Marquee words={FIRST_LINES_SECTION.marqueeB} reverse />
      </div>
    </Page>
  );
}

function BlankCard() {
  return (
    <li data-line-card>
      <a
        href="#waitlist"
        data-blank-card
        className="flex h-full min-h-40 items-center justify-center rounded-card border border-dashed border-accent bg-bg p-6 text-center font-display text-2xl text-accent-text italic"
      >
        {FIRST_LINES_SECTION.blank}
      </a>
    </li>
  );
}

function LineCard({ line, source }: { line: string; source: string }) {
  return (
    <li data-line-card className="rounded-card border border-rule bg-surface p-6">
      <blockquote>
        <p className="font-serif text-xl leading-snug">“{line}”</p>
        <footer className="mt-4 font-mono text-xs text-muted">{source}</footer>
      </blockquote>
    </li>
  );
}

function Marquee({ words, reverse }: { words: readonly string[]; reverse?: boolean }) {
  const row = [...words, ...words, ...words].join(" · ");
  return (
    <div className="overflow-hidden whitespace-nowrap">
      <p data-marquee={reverse ? "-1" : "1"} className="inline-block">
        {row} · {row}
      </p>
    </div>
  );
}
