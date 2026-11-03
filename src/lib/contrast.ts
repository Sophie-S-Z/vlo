/* WCAG 2 contrast for colors that Vlo shows on a page. */

export type Rgb = readonly [number, number, number];

/** Reads `#rgb`, `#rrggbb` and `rgb(r, g, b)` colors. Returns null for anything else. */
export function parseColor(value: string): Rgb | null {
  const text = value.trim().toLowerCase();
  const short = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/.exec(text);
  if (short) {
    const [, r = '0', g = '0', b = '0'] = short;
    return [parseInt(r + r, 16), parseInt(g + g, 16), parseInt(b + b, 16)];
  }
  const long = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/.exec(text);
  if (long) {
    const [, r = '00', g = '00', b = '00'] = long;
    return [parseInt(r, 16), parseInt(g, 16), parseInt(b, 16)];
  }
  const fn = /^rgba?\(\s*(\d{1,3})[\s,]+(\d{1,3})[\s,]+(\d{1,3})/.exec(text);
  if (fn) {
    const [, r = '0', g = '0', b = '0'] = fn;
    return [Math.min(Number(r), 255), Math.min(Number(g), 255), Math.min(Number(b), 255)];
  }
  return null;
}

export function toHex([r, g, b]: Rgb): string {
  return `#${[r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`;
}

function channel(v: number): number {
  const c = v / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

export function luminance([r, g, b]: Rgb): number {
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** The WCAG contrast ratio of two colors, from 1 to 21. */
export function contrastRatio(a: Rgb, b: Rgb): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

/** The color seen when `fg` is drawn at `alpha` opacity over `bg`. */
export function blend(fg: Rgb, bg: Rgb, alpha: number): Rgb {
  return [0, 1, 2].map((i) => alpha * (fg[i] ?? 0) + (1 - alpha) * (bg[i] ?? 0)) as unknown as Rgb;
}

/** WCAG AA for body text. */
export const AA_TEXT = 4.5;
