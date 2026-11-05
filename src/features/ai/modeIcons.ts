import type { AiMode } from '@/lib/db';

/*
 * The shapes of the mode badge icon (plan decision P1): a pen, an eye and two pens, on a 24 by 24 grid,
 * drawn with a 2 px stroke. Each icon is two closed shapes of SEGMENTS cubic curves, so all three have the
 * same list of numbers and one icon can morph into another point by point.
 */

/** Cubic curves in each closed shape. */
export const SEGMENTS = 6;

type Point = readonly [number, number];
/** One cubic curve: the two control points and the end point. */
type Curve = readonly [Point, Point, Point];
interface Shape {
  start: Point;
  curves: Curve[];
}

const lerp = (a: Point, b: Point, t: number): Point => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];

/** A closed shape with straight sides through the points. */
function polygon(points: readonly Point[]): Shape {
  const curves = points.map((from, i): Curve => {
    const to = points[(i + 1) % points.length] ?? from;
    return [lerp(from, to, 1 / 3), lerp(from, to, 2 / 3), to];
  });
  return { start: points[0] ?? [0, 0], curves };
}

/** A circle as four cubic curves. */
function circle(cx: number, cy: number, r: number): Shape {
  const k = 0.5523 * r;
  return {
    start: [cx + r, cy],
    curves: [
      [
        [cx + r, cy + k],
        [cx + k, cy + r],
        [cx, cy + r],
      ],
      [
        [cx - k, cy + r],
        [cx - r, cy + k],
        [cx - r, cy],
      ],
      [
        [cx - r, cy - k],
        [cx - k, cy - r],
        [cx, cy - r],
      ],
      [
        [cx + k, cy - r],
        [cx + r, cy - k],
        [cx + r, cy],
      ],
    ],
  };
}

/** Splits the longest curves in half until the shape has `count` curves. */
function withCurves(shape: Shape, count: number): Shape {
  const curves = [...shape.curves];
  while (curves.length < count) {
    let longest = 0;
    let length = -1;
    curves.forEach((curve, i) => {
      const from = i === 0 ? shape.start : (curves[i - 1]?.[2] ?? shape.start);
      const chord = Math.hypot(curve[2][0] - from[0], curve[2][1] - from[1]);
      if (chord > length) {
        length = chord;
        longest = i;
      }
    });
    const from = longest === 0 ? shape.start : (curves[longest - 1]?.[2] ?? shape.start);
    const [c1, c2, to] = curves[longest] ?? [from, from, from];
    // De Casteljau at t = 0.5.
    const a = lerp(from, c1, 0.5);
    const b = lerp(c1, c2, 0.5);
    const c = lerp(c2, to, 0.5);
    const d = lerp(a, b, 0.5);
    const e = lerp(b, c, 0.5);
    const mid = lerp(d, e, 0.5);
    curves.splice(longest, 1, [a, d, mid], [e, c, to]);
  }
  return { start: shape.start, curves };
}

function numbersOf(shapes: readonly Shape[]): number[] {
  return shapes.flatMap((shape) => {
    const full = withCurves(shape, SEGMENTS);
    return [...full.start, ...full.curves.flatMap((curve) => curve.flatMap((point) => [...point]))];
  });
}

const round = (n: number) => Math.round(n * 100) / 100;
const move = (points: readonly Point[], f: (p: Point) => Point) => points.map(f);

/** The pen body, its tip at the lower left. */
const PEN: readonly Point[] = [
  [3, 21],
  [4.2, 16.6],
  [16.6, 4.2],
  [19.19, 4.81],
  [19.8, 7.4],
  [7.4, 19.8],
];

/** The same pen at 66% of its size about the middle of the grid, moved by (d, d). */
const smallPen = (d: number) =>
  move(PEN, ([x, y]) => [round(12 + 0.66 * (x - 12) + d), round(12 + 0.66 * (y - 12) + d)]);

/** A flat shape along a line, so that its stroke draws the line. */
const line = (y: number, x1: number, x2: number): Point[] => {
  const step = (x2 - x1) / 3;
  return [
    [x1, y],
    [x1 + step, y],
    [x1 + 2 * step, y],
    [x2, y],
    [x1 + 2 * step, y],
    [x1 + step, y],
  ];
};

const EYE: Shape = {
  start: [2, 12],
  curves: [
    [
      [5.5, 3],
      [18.5, 3],
      [22, 12],
    ],
    [
      [18.5, 21],
      [5.5, 21],
      [2, 12],
    ],
  ],
};

/** The numbers of each icon: the pen and its line, the eye and its pupil, and two pens. */
export const ICONS: Record<AiMode, readonly number[]> = {
  pen: numbersOf([polygon(PEN), polygon(line(20, 12, 21))]).map(round),
  reader: numbersOf([EYE, circle(12, 12, 3)]).map(round),
  cowriter: numbersOf([polygon(smallPen(-3)), polygon(smallPen(3))]).map(round),
};

/** The numbers part of the way from one icon to another. */
export function mix(from: readonly number[], to: readonly number[], t: number): number[] {
  return from.map((n, i) => n * (1 - t) + (to[i] ?? n) * t);
}

/** An SVG path for the numbers: two closed shapes of cubic curves. */
export function toPath(numbers: readonly number[]): string {
  const per = 2 + SEGMENTS * 6;
  const parts: string[] = [];
  for (let s = 0; s < numbers.length; s += per) {
    const shape = numbers.slice(s, s + per).map((n) => String(Math.round(n * 100) / 100));
    parts.push(`M${shape.slice(0, 2).join(' ')}C${shape.slice(2).join(' ')}Z`);
  }
  return parts.join('');
}
