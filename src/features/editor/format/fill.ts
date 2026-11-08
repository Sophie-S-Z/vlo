import type { ResolvedTheme } from '@/app/preferences';
import { contrastRatio, parseColor, toHex } from '@/lib/contrast';
import { PAGE_COLORS } from './palette';

/*
 * Gradient, metallic, prismatic and glowing text. A fill is stored on the `textFill` mark as plain data
 * (stops, angle, look, shimmer, speed), so exports can draw it in their own way (plan decision 6).
 * Every value is checked when it is read, so pasted HTML cannot put other CSS into the page.
 */

export const LOOKS = ['gradient', 'metallic', 'prismatic', 'glow'] as const;
export type FillLook = (typeof LOOKS)[number];

export const LOOK_LABELS: Readonly<Record<FillLook, string>> = {
  gradient: 'Gradient',
  metallic: 'Metallic',
  prismatic: 'Prismatic',
  glow: 'Glow',
};

export interface FillStop {
  /** A #rrggbb color. */
  color: string;
  /** The place of the stop along the gradient, 0 to 100. */
  at: number;
}

export interface TextFill {
  stops: FillStop[];
  /** Degrees, 0 to 359. 90 runs left to right. */
  angle: number;
  look: FillLook;
  shimmer: boolean;
  /** Seconds for one shimmer pass, 2 to 12. */
  speed: number;
}

export const MIN_STOPS = 2;
export const MAX_STOPS = 8;
export const MIN_SPEED = 2;
export const MAX_SPEED = 12;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/** A fill from untrusted data: a stored mark, pasted HTML or a saved look. Null when it is not one. */
export function parseFill(value: unknown): TextFill | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Partial<Record<keyof TextFill, unknown>>;
  if (!Array.isArray(raw.stops)) return null;
  const stops: FillStop[] = [];
  for (const stop of raw.stops.slice(0, MAX_STOPS)) {
    if (!stop || typeof stop !== 'object') continue;
    const { color, at } = stop as { color?: unknown; at?: unknown };
    const rgb = typeof color === 'string' ? parseColor(color) : null;
    if (!rgb || typeof at !== 'number' || !Number.isFinite(at)) continue;
    stops.push({ color: toHex(rgb), at: clamp(Math.round(at), 0, 100) });
  }
  if (stops.length < MIN_STOPS) return null;
  stops.sort((a, b) => a.at - b.at);
  const angle = typeof raw.angle === 'number' && Number.isFinite(raw.angle) ? raw.angle : 90;
  const look = LOOKS.find((l) => l === raw.look) ?? 'gradient';
  const speed = typeof raw.speed === 'number' && Number.isFinite(raw.speed) ? raw.speed : 6;
  return {
    stops,
    angle: ((Math.round(angle) % 360) + 360) % 360,
    look,
    shimmer: raw.shimmer === true,
    speed: clamp(Math.round(speed), MIN_SPEED, MAX_SPEED),
  };
}

/** The CSS gradient for the fill's color stops. */
export function gradientCss(fill: TextFill): string {
  const stops = fill.stops.map((s) => `${s.color} ${String(s.at)}%`).join(', ');
  return `linear-gradient(${String(fill.angle)}deg, ${stops})`;
}

/** Inline style for a filled run. The look's class in editor.css adds the sheen, the glow or the motion. */
export function fillStyle(fill: TextFill): string {
  const glow = fill.stops[Math.floor(fill.stops.length / 2)]?.color ?? fill.stops[0]?.color ?? '#ffffff';
  return [
    `--vlo-fill: ${gradientCss(fill)}`,
    `--vlo-fill-glow: ${glow}`,
    `--vlo-fill-speed: ${String(fill.speed)}s`,
  ].join('; ');
}

/** The color of the gradient at `at` percent, for a new stop placed between two others. */
export function colorAt(fill: TextFill, at: number): string {
  const stops = [...fill.stops].sort((a, b) => a.at - b.at);
  const first = stops[0];
  const last = stops[stops.length - 1];
  if (!first || !last) return '#000000';
  if (at <= first.at) return first.color;
  if (at >= last.at) return last.color;
  for (let i = 1; i < stops.length; i++) {
    const a = stops[i - 1];
    const b = stops[i];
    if (!a || !b || at > b.at) continue;
    const t = b.at === a.at ? 0 : (at - a.at) / (b.at - a.at);
    const ca = parseColor(a.color);
    const cb = parseColor(b.color);
    if (!ca || !cb) return a.color;
    return toHex(
      [0, 1, 2].map((k) => (ca[k] ?? 0) + ((cb[k] ?? 0) - (ca[k] ?? 0)) * t) as unknown as [
        number,
        number,
        number,
      ],
    );
  }
  return last.color;
}

/** The lowest contrast of any stop against the page of a theme, with that stop. */
export function weakestStop(fill: TextFill, theme: ResolvedTheme): { stop: FillStop; ratio: number } | null {
  const bg = parseColor(PAGE_COLORS[theme].bg);
  if (!bg) return null;
  let weakest: { stop: FillStop; ratio: number } | null = null;
  for (const stop of fill.stops) {
    const rgb = parseColor(stop.color);
    if (!rgb) continue;
    const ratio = contrastRatio(rgb, bg);
    if (!weakest || ratio < weakest.ratio) weakest = { stop, ratio };
  }
  return weakest;
}

function preset(
  name: string,
  look: FillLook,
  colors: readonly string[],
  angle = 90,
  shimmer = true,
): { name: string; fill: TextFill } {
  const step = 100 / (colors.length - 1);
  return {
    name,
    fill: {
      stops: colors.map((color, i) => ({ color, at: Math.round(i * step) })),
      angle,
      look,
      shimmer,
      speed: 6,
    },
  };
}

/** Starting points. The writer can change any part of a preset in the gradient editor. */
export const FILL_PRESETS: readonly { name: string; fill: TextFill }[] = [
  preset('Gold leaf', 'metallic', ['#8a6316', '#e8c35a', '#fff0b3', '#c9971f', '#7a5512']),
  preset('Rose gold', 'metallic', ['#9a5a4f', '#e7a99a', '#ffe1d6', '#c9786a', '#8a4c42']),
  preset('Chrome', 'metallic', ['#5d6670', '#dfe5ec', '#ffffff', '#8b96a3', '#4b535c'], 180),
  preset('Copper', 'metallic', ['#7a3b16', '#d9894f', '#ffcfa1', '#b45f2b', '#6b3211']),
  preset('Opal', 'prismatic', ['#b7e4f7', '#f7c6e0', '#fdf2c4', '#c4f2dc', '#cbbcf6'], 120),
  preset('Holographic', 'prismatic', ['#ff8ad8', '#8affef', '#fff38a', '#a98aff', '#8ad1ff'], 135),
  preset('Prism', 'prismatic', ['#ff4d4d', '#ffa64d', '#ffe14d', '#4dff88', '#4dc3ff', '#9c4dff']),
  preset('Aurora', 'glow', ['#2ee6a8', '#3fb8ff', '#8f5bff', '#ff5bd0'], 100),
  preset('Nebula', 'glow', ['#3b1c8c', '#a23bd6', '#ff6ab0', '#ffb36a'], 120),
  preset('Moonstone', 'glow', ['#9fb4d9', '#e6eefc', '#b9c7e8', '#8fa3cc'], 90),
  preset('Ember', 'gradient', ['#ff3d2e', '#ff8a2b', '#ffd23f'], 90, false),
  preset('Lagoon', 'gradient', ['#0f8b8d', '#28c2b8', '#7fe0d0'], 90, false),
  preset('Sunset', 'gradient', ['#ff5f6d', '#ff9966', '#ffc371'], 90, false),
  preset('Peacock', 'gradient', ['#0b6e4f', '#1f9eb8', '#3b5bdb', '#7b2ff7'], 90, false),
  preset('Emerald', 'metallic', ['#0b4d2c', '#2fae6b', '#b8f5cf', '#1f8a52', '#0a3f24']),
  preset('Amethyst', 'glow', ['#4b1d7a', '#9a5ce6', '#e0c2ff', '#7b3fc4'], 120),
];

/** The default fill for the editor before the writer picks one. */
export const DEFAULT_FILL: TextFill = (
  FILL_PRESETS[0] ?? preset('Gold leaf', 'metallic', ['#8a6316', '#fff0b3'])
).fill;
