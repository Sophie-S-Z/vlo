import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';

const css = readFileSync('src/styles/themes.css', 'utf8');

function themeBlock(theme: string): Record<string, string> {
  const match = new RegExp(`\\[data-theme='${theme}'\\][^{]*\\{([^}]*)\\}`).exec(css);
  if (!match?.[1]) throw new Error(`No block for theme ${theme}`);
  const vars: Record<string, string> = {};
  for (const [, name, value] of match[1].matchAll(/--([\w-]+):\s*(#[0-9a-fA-F]{6})/g)) {
    if (name && value) vars[name] = value.toLowerCase();
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

describe.each(['ink', 'paper', 'sepia', 'contrast'])('theme %s', (theme) => {
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

test('the Contrast theme meets 7:1 for text and 3:1 for borders', () => {
  const vars = themeBlock('contrast');
  for (const fg of ['text', 'muted', 'accent-text'])
    for (const bg of ['bg', 'surface'])
      expect(contrast(vars[fg] ?? '', vars[bg] ?? '')).toBeGreaterThanOrEqual(7);
  expect(contrast(vars['on-accent'] ?? '', vars.accent ?? '')).toBeGreaterThanOrEqual(7);
  expect(contrast(vars.rule ?? '', vars.surface ?? '')).toBeGreaterThanOrEqual(3);
});

test('spec colors are present unchanged', () => {
  expect(themeBlock('ink')).toMatchObject({
    bg: '#0e0d0c',
    surface: '#171513',
    text: '#efe8dc',
    muted: '#8c857a',
    rule: '#2a2724',
    accent: '#e0664b',
  });
  expect(themeBlock('paper')).toMatchObject({
    bg: '#f5f1e8',
    surface: '#fbf8f2',
    text: '#1c1a17',
    muted: '#6b655c',
    rule: '#e2dccf',
    accent: '#c8452d',
  });
  expect(themeBlock('sepia')).toMatchObject({ bg: '#efe3cc', text: '#3a2e22', accent: '#a8432a' });
});

test('an unchecked switch has a --muted border, which meets 3:1 for controls in every theme', () => {
  const switchSource = readFileSync('src/ui/switch.tsx', 'utf8');
  expect(switchSource).toMatch(/rounded-full border border-muted bg-rule/);
  for (const theme of ['ink', 'paper', 'sepia', 'contrast']) {
    const vars = themeBlock(theme);
    expect(contrast(vars.muted ?? '', vars.surface ?? '')).toBeGreaterThanOrEqual(3);
    expect(contrast(vars.muted ?? '', vars.bg ?? '')).toBeGreaterThanOrEqual(3);
  }
});

/** The color seen when `fg` is drawn at `alpha` opacity over `bg`. */
function blend(fg: string, bg: string, alpha: number): string {
  const channel = (hex: string, i: number) => parseInt(hex.slice(i, i + 2), 16);
  return `#${[1, 3, 5]
    .map((i) =>
      Math.round(alpha * channel(fg, i) + (1 - alpha) * channel(bg, i))
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`;
}

test('dimmed lines in focus mode still meet WCAG AA in every theme', () => {
  const editorCss = readFileSync('src/styles/editor.css', 'utf8');
  const opacity = Number(/\.vlo-dim\s*\{[^}]*opacity:\s*([\d.]+)/.exec(editorCss)?.[1]);
  expect(opacity).toBeGreaterThan(0);
  for (const theme of ['ink', 'paper', 'sepia']) {
    const vars = themeBlock(theme);
    for (const bg of ['bg', 'surface']) {
      const back = vars[bg] ?? '';
      const seen = blend(vars.text ?? '', back, opacity);
      expect(contrast(seen, back), `${theme} on --${bg}`).toBeGreaterThanOrEqual(4.5);
    }
  }
});
