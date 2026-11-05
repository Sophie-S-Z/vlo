/*
 * Story Board geometry (spec 8.1, plan Task C2). Pure functions, so each one has a unit test. A view is
 * the board's pan and zoom: a board point (bx, by) shows on the screen at (x + bx * scale, y + by * scale).
 */

export const GRID = 8;
export const MIN_SCALE = 0.1;
export const MAX_SCALE = 4;
/** The size of a card on the board, in board pixels at 100 %. */
export const CARD_WIDTH = 208;
export const CARD_HEIGHT = 128;

export interface View {
  x: number;
  y: number;
  scale: number;
}

export interface Point {
  x: number;
  y: number;
}

export interface Size {
  width: number;
  height: number;
}

/** The nearest grid line. */
export function snap(value: number, grid = GRID): number {
  // "|| 0" turns -0 into 0, so a stored position never shows as "-0".
  return Math.round(value / grid) * grid || 0;
}

export function clampScale(scale: number): number {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale));
}

/** The board point under a screen point. */
export function toBoard(view: View, screen: Point): Point {
  return { x: (screen.x - view.x) / view.scale, y: (screen.y - view.y) / view.scale };
}

/** Zooms by `factor`, and keeps the board point under `screen` where it is on the screen. */
export function zoomAt(view: View, factor: number, screen: Point): View {
  const scale = clampScale(view.scale * factor);
  const at = toBoard(view, screen);
  return { scale, x: screen.x - at.x * scale, y: screen.y - at.y * scale };
}

/** The view that shows every card with a margin, at 100 % or less. An empty board shows the origin. */
export function fitAll(cards: readonly Point[], viewport: Size, margin = 48): View {
  if (cards.length === 0) return { x: margin, y: margin, scale: 1 };
  const left = Math.min(...cards.map((c) => c.x));
  const top = Math.min(...cards.map((c) => c.y));
  const right = Math.max(...cards.map((c) => c.x + CARD_WIDTH));
  const bottom = Math.max(...cards.map((c) => c.y + CARD_HEIGHT));
  const scale = clampScale(
    Math.min(
      1,
      (viewport.width - 2 * margin) / Math.max(1, right - left),
      (viewport.height - 2 * margin) / Math.max(1, bottom - top),
    ),
  );
  return {
    scale,
    x: (viewport.width - (right - left) * scale) / 2 - left * scale,
    y: (viewport.height - (bottom - top) * scale) / 2 - top * scale,
  };
}

/** The view that centers a card at `scale`. */
export function centerOn(card: Point, viewport: Size, scale: number): View {
  const s = clampScale(scale);
  return {
    scale: s,
    x: viewport.width / 2 - (card.x + CARD_WIDTH / 2) * s,
    y: viewport.height / 2 - (card.y + CARD_HEIGHT / 2) * s,
  };
}

/** The point where the line from a card's center toward `toward` leaves the card. */
function edge(card: Point, toward: Point): Point {
  const cx = card.x + CARD_WIDTH / 2;
  const cy = card.y + CARD_HEIGHT / 2;
  const dx = toward.x - cx;
  const dy = toward.y - cy;
  if (dx === 0 && dy === 0) return { x: cx, y: cy };
  const t = Math.min(
    dx === 0 ? Infinity : CARD_WIDTH / 2 / Math.abs(dx),
    dy === 0 ? Infinity : CARD_HEIGHT / 2 / Math.abs(dy),
  );
  return { x: cx + dx * t, y: cy + dy * t };
}

/** An SVG path for a thread between two cards: a soft curve from edge to edge. */
export function threadPath(from: Point, to: Point): string {
  const a = edge(from, { x: to.x + CARD_WIDTH / 2, y: to.y + CARD_HEIGHT / 2 });
  const b = edge(to, { x: from.x + CARD_WIDTH / 2, y: from.y + CARD_HEIGHT / 2 });
  const horizontal = Math.abs(b.x - a.x) >= Math.abs(b.y - a.y);
  const bend = (horizontal ? b.x - a.x : b.y - a.y) / 2;
  const c1 = horizontal ? { x: a.x + bend, y: a.y } : { x: a.x, y: a.y + bend };
  const c2 = horizontal ? { x: b.x - bend, y: b.y } : { x: b.x, y: b.y - bend };
  const n = (v: number) => String(Math.round(v * 10) / 10);
  return `M ${n(a.x)} ${n(a.y)} C ${n(c1.x)} ${n(c1.y)}, ${n(c2.x)} ${n(c2.y)}, ${n(b.x)} ${n(b.y)}`;
}

/*
 * Inertia: after a throw, a card glides and slows down. The glide follows an exponential decay with time
 * constant TAU, so it travels velocity * TAU in all. The end point snaps to the grid, and the glide aims
 * at that point, so the card stops on a grid line with no jump.
 */
export const TAU = 325;
/** A throw slower than this (pixels per millisecond) does not glide. */
export const MIN_THROW = 0.2;

/** Where a card thrown from `at` with `velocity` (board pixels per millisecond) comes to rest. */
export function glideEnd(at: Point, velocity: Point): Point {
  const fast = Math.hypot(velocity.x, velocity.y) >= MIN_THROW;
  return {
    x: snap(fast ? at.x + velocity.x * TAU : at.x),
    y: snap(fast ? at.y + velocity.y * TAU : at.y),
  };
}

/** The position `elapsed` milliseconds into a glide from `from` to `to`. */
export function glideAt(from: Point, to: Point, elapsed: number): Point {
  const left = Math.exp(-elapsed / TAU);
  return { x: to.x - (to.x - from.x) * left, y: to.y - (to.y - from.y) * left };
}

/** A glide is over when less than half a pixel is left. */
export function glideDone(from: Point, to: Point, elapsed: number): boolean {
  const left = Math.exp(-elapsed / TAU);
  return Math.hypot(to.x - from.x, to.y - from.y) * left < 0.5;
}

/** Places `count` new cards in rows below `below`, on the grid. */
export function gridPlaces(count: number, below: number, columns = 4, gap = 24): Point[] {
  return Array.from({ length: count }, (_, i) => ({
    x: snap((i % columns) * (CARD_WIDTH + gap)),
    y: snap(below + Math.floor(i / columns) * (CARD_HEIGHT + gap)),
  }));
}
