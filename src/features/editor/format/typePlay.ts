import { VLO_FONTS } from './fonts';

/*
 * Type play: the shape and life of the letters in a run of text, on the `typePlay` mark. A writer sets the
 * exact weight of a variable font, the space between letters, the font's own design axes (such as the
 * softness of Fraunces or the casual hand of Recursive), an effect drawn around the letters, and a slow
 * motion. The data is checked when it is read, so pasted HTML cannot put other CSS into the page. These
 * looks are for the screen: exports keep a heavy weight as bold and draw the rest as plain text.
 */

export const EFFECTS = ['outline', 'engraved', 'lifted', 'echo'] as const;
export type TypeEffect = (typeof EFFECTS)[number];

export const EFFECT_LABELS: Readonly<Record<TypeEffect, string>> = {
  outline: 'Outline',
  engraved: 'Engraved',
  lifted: 'Lifted',
  echo: 'Echo',
};

export const MOTIONS = ['breathe', 'flicker'] as const;
export type TypeMotion = (typeof MOTIONS)[number];

export const MOTION_LABELS: Readonly<Record<TypeMotion, string>> = {
  breathe: 'Breathe',
  flicker: 'Flicker',
};

export interface TypePlay {
  /** A font weight, 100 to 1000. A variable font draws every value; other fonts take the nearest weight. */
  weight?: number;
  /** Space between letters, in em. */
  tracking?: number;
  /** Values for design axes, by OpenType tag. */
  axes?: Readonly<Record<string, number>>;
  effect?: TypeEffect;
  motion?: TypeMotion;
}

export const MIN_WEIGHT = 100;
export const MAX_WEIGHT = 1000;
export const MIN_TRACKING = -0.05;
export const MAX_TRACKING = 0.5;

/** The range of each axis tag over all Vlo fonts. A value outside it never reaches the page. */
const AXIS_LIMITS: ReadonlyMap<string, { min: number; max: number }> = (() => {
  const limits = new Map<string, { min: number; max: number }>();
  for (const axis of VLO_FONTS.flatMap((font) => font.axes ?? [])) {
    const known = limits.get(axis.tag);
    limits.set(axis.tag, {
      min: Math.min(known?.min ?? axis.min, axis.min),
      max: Math.max(known?.max ?? axis.max, axis.max),
    });
  }
  return limits;
})();

function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/** Rounds to the step of a slider, so stored values stay short. */
function snap(value: number, step: number): number {
  return Math.round(value / step) * step;
}

/** Type play from untrusted data: a stored mark or pasted HTML. Null when it holds no change. */
export function parsePlay(value: unknown): TypePlay | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Partial<Record<keyof TypePlay, unknown>>;
  const play: { -readonly [K in keyof TypePlay]: TypePlay[K] } = {};
  if (finite(raw.weight)) play.weight = clamp(snap(raw.weight, 10), MIN_WEIGHT, MAX_WEIGHT);
  if (finite(raw.tracking)) {
    const tracking = Number(clamp(snap(raw.tracking, 0.01), MIN_TRACKING, MAX_TRACKING).toFixed(2));
    if (tracking !== 0) play.tracking = tracking;
  }
  if (raw.axes && typeof raw.axes === 'object') {
    const axes: Record<string, number> = {};
    for (const [tag, axisValue] of Object.entries(raw.axes as Record<string, unknown>)) {
      const limits = AXIS_LIMITS.get(tag);
      if (limits && finite(axisValue))
        axes[tag] = Number(clamp(axisValue, limits.min, limits.max).toFixed(2));
    }
    if (Object.keys(axes).length > 0) play.axes = axes;
  }
  const effect = EFFECTS.find((e) => e === raw.effect);
  if (effect) play.effect = effect;
  const motion = MOTIONS.find((m) => m === raw.motion);
  if (motion) play.motion = motion;
  return Object.keys(play).length > 0 ? play : null;
}

/** The inline style of a run. Only checked numbers and known axis tags reach it. */
export function playStyle(play: TypePlay): string {
  const parts: string[] = [];
  if (play.weight !== undefined) parts.push(`font-weight: ${String(play.weight)}`);
  if (play.tracking !== undefined) parts.push(`letter-spacing: ${String(play.tracking)}em`);
  const axes = Object.entries(play.axes ?? {});
  if (axes.length > 0) {
    parts.push(
      `font-variation-settings: ${axes.map(([tag, value]) => `'${tag}' ${String(value)}`).join(', ')}`,
    );
  }
  return parts.join('; ');
}

/** The classes that draw the effect and the motion (editor.css). */
export function playClass(play: TypePlay): string {
  return [
    'vlo-play',
    play.effect ? `vlo-play-${play.effect}` : '',
    play.motion ? `vlo-play-${play.motion}` : '',
  ]
    .filter(Boolean)
    .join(' ');
}
