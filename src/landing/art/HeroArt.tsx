import { useSyncExternalStore } from "react";
import { firstLine, subscribeFirstLine } from "../firstLine";

/**
 * Still art for the hero: a field of glyphs (fallback for the M1b particles). The visitor's
 * first line shows in it, faint and large, when the particles do not run (ADR 0012).
 */
export function HeroArt() {
  const line = useSyncExternalStore(subscribeFirstLine, firstLine, () => "");
  const glyphs = "abcdefghijklmnopqrstuvwxyzéàç,.;—".split("");
  const cells = Array.from({ length: 180 }, (_, i) => {
    const x = (i * 37) % 100;
    const y = (i * 61) % 100;
    return { x, y, g: glyphs[i % glyphs.length], o: 0.06 + ((i * 13) % 10) / 120 };
  });
  return (
    <svg
      data-still-art="hero"
      viewBox="0 0 100 100"
      preserveAspectRatio="xMidYMid slice"
      className="pointer-events-none absolute inset-0 size-full text-muted"
      aria-hidden="true"
    >
      {cells.map((c, i) => (
        <text
          key={i}
          x={c.x}
          y={c.y}
          fontSize="2.2"
          className="fill-current font-mono"
          opacity={c.o}
        >
          {c.g}
        </text>
      ))}
      {line && (
        <text
          data-still-line
          x="50"
          y="50"
          textAnchor="middle"
          fontSize={Math.min(8, 170 / line.length)}
          className="fill-current font-display"
          opacity="0.35"
        >
          {line}
        </text>
      )}
    </svg>
  );
}
