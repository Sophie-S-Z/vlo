/** Still art for the hero: the "Vlo" wordmark as a field of glyphs (fallback for the M1b particles). */
export function HeroArt() {
  const glyphs = "abcdefghijklmnopqrstuvwxyzéàç,.;—".split("");
  const cells = Array.from({ length: 180 }, (_, i) => {
    const x = (i * 37) % 100;
    const y = (i * 61) % 100;
    return { x, y, g: glyphs[i % glyphs.length], o: 0.08 + ((i * 13) % 10) / 60 };
  });
  return (
    <svg
      data-still-art="hero"
      viewBox="0 0 100 100"
      preserveAspectRatio="xMidYMid slice"
      className="pointer-events-none absolute inset-0 size-full text-fg"
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
    </svg>
  );
}
