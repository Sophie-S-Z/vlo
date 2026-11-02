import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';

const css = readFileSync('src/styles/themes.css', 'utf8');

function themeBlock(theme: string): Record<string, string> {
  const match = new RegExp(`\\[data-theme='${theme}'\\][^{]*\\{([^}]*)\\}`).exec(css);
  if (!match?.[1]) throw new Error(`No block for theme ${theme}`);
  const vars: Record<string, string> = {};
  for (const [, name, value] of match[1].matchAll(/--([\w-]+):\s*(#[0-9a-fA-F]{6})/g)) {
    if (name && value) vars[name] = value;
  }
  return vars;
}

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const v = parseInt(hex.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

describe.each(['ink', 'paper', 'sepia'])('theme %s', (theme) => {
  const vars = themeBlock(theme);
  test.each(['text', 'muted', 'accent-text'])('--%s meets WCAG AA on --bg and --surface', (fg) => {
    const color = vars[fg];
    expect(color, `--${fg} in ${theme}`).toBeDefined();
    for (const bg of ['bg', 'surface']) {
      const back = vars[bg];
      expect(back, `--${bg} in ${theme}`).toBeDefined();
      expect(contrast(color ?? '', back ?? '')).toBeGreaterThanOrEqual(4.5);
    }
  });

  test('--accent meets 3:1 for large text and icons on --bg', () => {
    expect(contrast(vars.accent ?? '', vars.bg ?? '')).toBeGreaterThanOrEqual(3);
  });
});

test('spec colors are present unchanged', () => {
  expect(themeBlock('ink')).toMatchObject({
    bg: '#0E0D0C',
    surface: '#171513',
    text: '#EFE8DC',
    muted: '#8C857A',
    rule: '#2A2724',
    accent: '#E0664B',
  });
  expect(themeBlock('paper')).toMatchObject({
    bg: '#F5F1E8',
    surface: '#FBF8F2',
    text: '#1C1A17',
    muted: '#6B655C',
    rule: '#E2DCCF',
    accent: '#C8452D',
  });
  expect(themeBlock('sepia')).toMatchObject({ bg: '#EFE3CC', text: '#3A2E22', accent: '#A8432A' });
});
