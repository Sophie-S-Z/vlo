import type { PageFormat } from '@/lib/db';

/*
 * Page format (plan Task A7, decision 8). The text sits on one sheet with 1 inch margins. Page-end lines
 * mark where each page would end. The PDF export is the exact layout; the lines come close to it.
 */

/** CSS pixels in one inch. */
const INCH = 96;
const MM = INCH / 25.4;

export interface PageSize {
  label: string;
  /** Sheet width and height in CSS pixels. */
  width: number;
  height: number;
  /** The margin on each side in CSS pixels. */
  margin: number;
}

export const PAGE_SIZES: Readonly<Record<Exclude<PageFormat, 'pageless'>, PageSize>> = {
  letter: { label: 'Letter', width: 8.5 * INCH, height: 11 * INCH, margin: INCH },
  a4: { label: 'A4', width: 210 * MM, height: 297 * MM, margin: INCH },
};

export const PAGE_FORMATS: readonly { value: PageFormat; label: string; hint: string }[] = [
  { value: 'pageless', label: 'Pageless', hint: 'The text flows with no page ends.' },
  { value: 'letter', label: 'Letter', hint: '8.5 by 11 inches, used in the US and Canada.' },
  { value: 'a4', label: 'A4', hint: '210 by 297 mm, used in most other countries.' },
];

export function cleanPageFormat(value: unknown): PageFormat {
  return value === 'letter' || value === 'a4' ? value : 'pageless';
}

/** The height of text that fits on one page. */
export function pageTextHeight(size: PageSize): number {
  return size.height - 2 * size.margin;
}

/**
 * The page-end offsets, from the top of the text, for text of `height` pixels. Text that fills exactly one
 * page has no page end inside it.
 */
export function pageEnds(height: number, size: PageSize): number[] {
  const page = pageTextHeight(size);
  if (!(height > 0) || !(page > 0)) return [];
  const count = Math.ceil(height / page) - 1;
  return Array.from({ length: Math.max(count, 0) }, (_, i) => (i + 1) * page);
}

/** The number of pages for text of `height` pixels. Empty text still has one page. */
export function pageCount(height: number, size: PageSize): number {
  return pageEnds(height, size).length + 1;
}

/** Page zoom (E7), in percent. */
export const ZOOM_MIN = 80;
export const ZOOM_MAX = 200;
export const ZOOM_STEP = 10;

export function cleanZoom(value: unknown): number {
  const n = typeof value === 'number' && Number.isFinite(value) ? value : 100;
  const stepped = Math.round(n / ZOOM_STEP) * ZOOM_STEP;
  return Math.min(Math.max(stepped, ZOOM_MIN), ZOOM_MAX);
}
