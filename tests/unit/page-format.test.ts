import { describe, expect, test } from 'vitest';
import {
  cleanPageFormat,
  cleanZoom,
  MIN_SHEET_ZOOM,
  pageBreaks,
  pageTextHeight,
  PAGE_SIZES,
  sheetZoom,
  type BlockBox,
} from '@/features/editor/format/page';

/* Task A7: page format, page-end lines and page zoom. */

/** Text blocks of `lines` lines each, `gap` pixels apart, with 20 px lines. */
function paragraphs(counts: readonly number[], gap = 10, line = 20): BlockBox[] {
  let top = 0;
  return counts.map((lines) => {
    const box = { top, bottom: top + lines * line, line };
    top = box.bottom + gap;
    return box;
  });
}

describe('page sizes', () => {
  test('Letter and A4 have 1 inch margins in CSS pixels', () => {
    expect(PAGE_SIZES.letter).toMatchObject({ width: 816, height: 1056, margin: 96 });
    expect(PAGE_SIZES.a4.width).toBeCloseTo(793.7, 1);
    expect(PAGE_SIZES.a4.height).toBeCloseTo(1122.5, 1);
    expect(pageTextHeight(PAGE_SIZES.letter)).toBe(864);
  });

  test('a stored page format is pageless unless it is Letter or A4', () => {
    expect(cleanPageFormat('letter')).toBe('letter');
    expect(cleanPageFormat('a4')).toBe('a4');
    expect(cleanPageFormat('legal')).toBe('pageless');
    expect(cleanPageFormat(undefined)).toBe('pageless');
  });
});

describe('page breaks', () => {
  test('text shorter than a page has no page end', () => {
    expect(pageBreaks(paragraphs([3, 4]), 200)).toEqual([]);
    expect(pageBreaks([], 200)).toEqual([]);
  });

  test('a page end inside a paragraph moves up to the last whole line', () => {
    // Lines at 0-20-40-...; the page holds 210 px, so 10 lines (200 px) fit and line 11 starts page 2.
    expect(pageBreaks(paragraphs([30]), 210)).toEqual([200, 400]);
  });

  test('a page end in the gap between blocks starts the next page with the next block', () => {
    // Block 1 ends at 100, block 2 starts at 110. The page ends at 105.
    expect(pageBreaks(paragraphs([5, 5]), 105)).toEqual([110]);
  });

  test('a block that never splits moves whole to the next page', () => {
    const blocks: BlockBox[] = [
      { top: 0, bottom: 150, line: 20 },
      { top: 160, bottom: 260, line: null },
    ];
    expect(pageBreaks(blocks, 200)).toEqual([160]);
  });

  test('a block taller than a page is cut at each page end, so the measure always ends', () => {
    expect(pageBreaks([{ top: 0, bottom: 450, line: null }], 200)).toEqual([200, 400]);
    // A single line taller than the page.
    expect(pageBreaks([{ top: 0, bottom: 450, line: 450 }], 200)).toEqual([200, 400]);
  });

  test('a page break count follows the text length', () => {
    const blocks = paragraphs(Array.from({ length: 200 }, () => 4));
    const breaks = pageBreaks(blocks, 864);
    // 200 paragraphs of 80 px with 10 px gaps fill about 17,990 px, about 21 pages of 864 px.
    expect(breaks.length).toBeGreaterThanOrEqual(20);
    expect(breaks.length).toBeLessThanOrEqual(22);
    for (let i = 1; i < breaks.length; i++) {
      const gap = (breaks[i] ?? 0) - (breaks[i - 1] ?? 0);
      expect(gap).toBeGreaterThan(0);
      expect(gap).toBeLessThanOrEqual(864);
    }
  });

  test('a zero page height gives no breaks', () => {
    expect(pageBreaks(paragraphs([30]), 0)).toEqual([]);
  });
});

describe('sheet zoom', () => {
  test('the sheet takes the writer’s zoom when the window is wide enough', () => {
    expect(sheetZoom(2000, PAGE_SIZES.letter, 150)).toBe(1.5);
  });

  test('a narrow window shrinks the sheet to fit', () => {
    expect(sheetZoom(700, PAGE_SIZES.letter, 100)).toBeCloseTo(700 / 816);
  });

  test('a window too narrow for readable text shows the text pageless', () => {
    expect(sheetZoom(400, PAGE_SIZES.letter, 100)).toBeNull();
    expect(sheetZoom(816 * MIN_SHEET_ZOOM, PAGE_SIZES.letter, 100)).toBe(MIN_SHEET_ZOOM);
  });

  test('zoom is a step of 10 between 80 and 200 percent', () => {
    expect(cleanZoom(133)).toBe(130);
    expect(cleanZoom(20)).toBe(80);
    expect(cleanZoom(900)).toBe(200);
    expect(cleanZoom('big')).toBe(100);
  });
});
