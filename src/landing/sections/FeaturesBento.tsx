import { useState } from "react";
import { FEATURES } from "../copy";
import { Eyebrow, Page } from "./Page";

const t = FEATURES.tiles;

export function FeaturesBento() {
  const [version, setVersion] = useState(5);
  return (
    <Page n={7} id="features" titleId="features-title" className="mx-auto max-w-6xl">
      <Eyebrow n={7}>Features</Eyebrow>
      <h2 id="features-title" className="font-display text-[clamp(2rem,5vw,4rem)] leading-tight">
        {FEATURES.title}
      </h2>
      <p className="mt-4 font-mono text-xs text-muted uppercase">Coming with the first release</p>
      <ul
        data-bento
        className="mt-12 grid auto-rows-[minmax(10rem,auto)] gap-3 sm:grid-cols-2 lg:grid-cols-4"
      >
        <Tile className="lg:col-span-2" title={t.snapshots}>
          <input
            type="range"
            min={1}
            max={5}
            value={version}
            onChange={(event) => setVersion(Number(event.target.value))}
            aria-label="Snapshot version"
            data-snapshot-slider
            className="w-full accent-[var(--vlo-accent)]"
          />
          <p className="mt-2 font-mono text-xs text-muted">
            Version <span data-snapshot-value>{version}</span> of 5
          </p>
        </Tile>
        <Tile title={t.formats}>
          <p
            data-format-cycle="DOCX|PDF|EPUB|Markdown"
            className="font-mono text-sm text-accent-text"
          >
            DOCX
          </p>
        </Tile>
        <Tile title={t.offline}>
          <svg viewBox="0 0 24 24" className="size-8 text-accent" aria-hidden="true">
            <path
              data-check
              d="M5 12.5l4.5 4.5L19 7.5"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </Tile>
        <Tile title={t.timer}>
          <svg viewBox="0 0 40 40" className="size-12" aria-hidden="true">
            <circle cx="20" cy="20" r="16" fill="none" stroke="var(--vlo-rule)" strokeWidth="3" />
            <circle
              data-timer-ring
              cx="20"
              cy="20"
              r="16"
              fill="none"
              stroke="var(--vlo-accent)"
              strokeWidth="3"
              strokeDasharray="100.5"
              strokeDashoffset="30"
              transform="rotate(-90 20 20)"
              pathLength="100.5"
            />
          </svg>
        </Tile>
        <Tile title={t.themes}>
          <div data-theme-flip className="flex gap-2" aria-hidden="true">
            {["#0E0D0C", "#F5F1E8", "#121110", "#EFE3CC"].map((c) => (
              <span
                key={c}
                className="size-6 rounded-full border border-rule"
                style={{ background: c }}
              />
            ))}
          </div>
        </Tile>
        <Tile className="lg:col-span-2" title={t.map}>
          <div data-mosaic className="grid grid-cols-12 gap-1" aria-hidden="true">
            {Array.from({ length: 36 }, (_, i) => (
              <span
                key={i}
                className="aspect-square rounded-[2px]"
                style={{
                  background:
                    i % 7 === 0
                      ? "var(--vlo-accent)"
                      : i % 3 === 0
                        ? "var(--vlo-muted)"
                        : "var(--vlo-rule)",
                }}
              />
            ))}
          </div>
        </Tile>
        <Tile title={t.share}>
          <p className="font-mono text-xs text-muted">vlo/share/…#key</p>
        </Tile>
        <Tile title={t.price}>
          <p data-count-to="0" className="font-display text-6xl text-accent-text">
            $0
          </p>
        </Tile>
      </ul>
    </Page>
  );
}

function Tile({
  title,
  className,
  children,
}: {
  title: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <li
      className={`flex flex-col justify-between gap-6 rounded-card border border-rule bg-surface p-5 ${className ?? ""}`}
    >
      <h3 className="font-display text-xl leading-snug">{title}</h3>
      <div>{children}</div>
    </li>
  );
}
