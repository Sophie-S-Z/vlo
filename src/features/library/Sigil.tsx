import type { SVGProps } from 'react';

/** FNV-1a: the same seed always gives the same seal. */
function hash(seed: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i += 1) h = Math.imul(h ^ seed.charCodeAt(i), 0x01000193);
  return h >>> 0;
}

/** The corners of a regular polygon around the centre, with the first corner turned by `turn` radians. */
function corners(sides: number, radius: number, turn: number): [number, number][] {
  return Array.from({ length: sides }, (_, i) => {
    const angle = turn + (i / sides) * Math.PI * 2;
    return [
      Math.round(Math.sin(angle) * radius * 100) / 100,
      Math.round(-Math.cos(angle) * radius * 100) / 100,
    ];
  });
}

const points = (list: [number, number][]) => list.map(([x, y]) => `${String(x)},${String(y)}`).join(' ');

const TICKS = [24, 36, 48] as const;

/**
 * A seal drawn from a seed, such as a project id: a tick ring, two interlaced polygons and an inner
 * circle. Each project gets its own seal, and the seal never changes. It is decoration only.
 */
export function Sigil({ seed, className, ...props }: { seed: string } & SVGProps<SVGSVGElement>) {
  const h = hash(seed);
  const sides = 3 + (h % 5);
  const turn = (((h >>> 3) % 12) / 12) * ((Math.PI * 2) / sides);
  const inner = 10 + ((h >>> 7) % 3) * 4;
  const ticks = TICKS[(h >>> 11) % TICKS.length] ?? 36;
  const outer = corners(sides, 32, turn);
  return (
    <svg
      viewBox="-50 -50 100 100"
      fill="none"
      stroke="currentColor"
      aria-hidden="true"
      focusable="false"
      className={className ? `vlo-sigil ${className}` : 'vlo-sigil'}
      {...props}
    >
      <circle r="47" />
      <circle
        r="41"
        className="vlo-sigil-ticks"
        strokeWidth="4"
        pathLength={ticks * 2}
        strokeDasharray="0.14 1.86"
      />
      <polygon points={points(outer)} />
      <polygon points={points(corners(sides, 32, turn + Math.PI / sides))} />
      <circle r={inner} />
      {outer.map(([x, y]) => (
        <circle key={`${String(x)},${String(y)}`} cx={x} cy={y} r="2" fill="currentColor" stroke="none" />
      ))}
      <circle r="2.5" fill="currentColor" stroke="none" />
    </svg>
  );
}
