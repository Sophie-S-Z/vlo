import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import type { ResolvedTheme } from '@/app/preferences';
import {
  HIGHLIGHTS,
  PAGE_COLORS,
  TEXT_COLORS,
  paletteCss,
  resolveColor,
  swatchOf,
  swatchVar,
} from '@/features/editor/format/palette';
import { AA_TEXT, blend, contrastRatio, parseColor, toHex } from '@/lib/contrast';

const THEMES: ResolvedTheme[] = ['ink', 'paper', 'sepia'];
const css = readFileSync('src/styles/themes.css', 'utf8');

function rgb(value: string) {
  const parsed = parseColor(value);
  if (!parsed) throw new Error(`Not a color: ${value}`);
  return parsed;
}

test('the page colors match themes.css', () => {
  for (const theme of THEMES) {
    const block = new RegExp(`\\[data-theme='${theme}'\\][^{]*\\{([^}]*)\\}`).exec(css)?.[1] ?? '';
    for (const [name, value] of Object.entries(PAGE_COLORS[theme])) {
      expect(block, `${theme} --${name}`).toContain(`--${name}: ${value};`);
    }
  }
});

describe.each(THEMES)('on the %s theme', (theme) => {
  const page = PAGE_COLORS[theme];

  test.each(TEXT_COLORS.map((s) => [s.label, s] as const))(
    'the %s text color meets WCAG AA on the page and the surface',
    (_label, swatch) => {
      for (const back of [page.bg, page.surface]) {
        expect(contrastRatio(rgb(swatch.values[theme]), rgb(back))).toBeGreaterThanOrEqual(AA_TEXT);
      }
    },
  );

  test.each(HIGHLIGHTS.map((s) => [s.label, s] as const))(
    'text on the %s highlight meets WCAG AA',
    (_label, swatch) => {
      expect(contrastRatio(rgb(page.text), rgb(swatch.values[theme]))).toBeGreaterThanOrEqual(AA_TEXT);
    },
  );
});

test('a stored swatch resolves to its theme color, and a custom color passes through', () => {
  expect(resolveColor(swatchVar('text', 'rose'), 'ink')).toBe('#d8586d');
  expect(resolveColor(swatchVar('mark', 'mint'), 'paper')).toBe('#8ef0bd');
  expect(resolveColor('#123456', 'sepia')).toBe('#123456');
  expect(swatchOf('var(--vlo-text-nope)')).toBeUndefined();
  expect(swatchOf(' var(--vlo-mark-sky) ')?.swatch.label).toBe('Sky');
});

test('the palette CSS defines every swatch for every theme', () => {
  const out = paletteCss();
  for (const theme of THEMES) expect(out).toContain(`[data-theme='${theme}']`);
  for (const s of TEXT_COLORS) expect(out).toContain(`--vlo-text-${s.id}: ${s.values.paper};`);
  for (const s of HIGHLIGHTS) expect(out).toContain(`--vlo-mark-${s.id}: ${s.values.ink};`);
});

describe('contrast helpers', () => {
  test('parse the color forms Vlo stores', () => {
    expect(parseColor('#abc')).toEqual([170, 187, 204]);
    expect(parseColor('#A1B2C3')).toEqual([161, 178, 195]);
    expect(parseColor('rgb(1, 2, 3)')).toEqual([1, 2, 3]);
    expect(parseColor('var(--x)')).toBeNull();
    expect(toHex([255, 0, 16])).toBe('#ff0010');
  });

  test('give 21:1 for black on white and blend by opacity', () => {
    expect(contrastRatio([0, 0, 0], [255, 255, 255])).toBeCloseTo(21, 5);
    expect(blend([0, 0, 0], [255, 255, 255], 0.5)).toEqual([127.5, 127.5, 127.5]);
  });
});
