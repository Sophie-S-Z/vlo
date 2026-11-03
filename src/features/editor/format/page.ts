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

/** One block of text as the page measure sees it, in pixels from the top of the text. */
export interface BlockBox {
  top: number;
  bottom: number;
  /**
   * The line height for a block of text lines, which a page end can split between two lines. Null for a
   * block that never splits, such as an equation or a scene break.
   */
  line: number | null;
}

/**
 * The offsets where each new page starts, from the top of the text. A page end that falls inside a block
 * of text lines moves up to the last whole line, so that line starts the next page. A block that never
 * splits moves whole to the next page, unless it is taller than a page.
 */
export function pageBreaks(blocks: readonly BlockBox[], pageHeight: number): number[] {
  if (!(pageHeight > 0)) return [];
  const breaks: number[] = [];
  let start = 0;
  for (const block of blocks) {
    if (!(block.bottom > block.top)) continue;
    while (block.bottom > start + pageHeight) {
      const end = start + pageHeight;
      let next = end;
      if (block.top >= end) {
        // The page ends in the gap above the block, so the block starts the next page.
        next = block.top < end + pageHeight ? block.top : end;
      } else if (block.line !== null && block.line > 0) {
        const lines = Math.floor((end - block.top) / block.line + 1e-6);
        next = block.top + lines * block.line;
      } else if (block.top > start) {
        next = block.top;
      }
      // A line or block taller than a page is cut at the page end, so the measure always moves on.
      if (!(next > start)) next = end;
      breaks.push(next);
      start = next;
    }
  }
  return breaks;
}

/** The sheet shrinks to fit a narrow window down to this zoom. Below it, the text shows pageless. */
export const MIN_SHEET_ZOOM = 0.75;

/**
 * The zoom for a sheet of `size` in `available` pixels at the writer's zoom (in percent): the writer's zoom,
 * or less when the window is narrow. Null when the sheet would be too small to read.
 */
export function sheetZoom(available: number, size: PageSize, zoom: number): number | null {
  const fit = Math.min(zoom / 100, available / size.width);
  return fit >= MIN_SHEET_ZOOM ? fit : null;
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
