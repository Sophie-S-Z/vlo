import type { ResolvedTheme } from '@/app/preferences';

/*
 * Theme-aware colors for text and highlights. The document stores a CSS variable, such as
 * `var(--vlo-text-rose)`, so a rose word stays readable when the writer changes the theme. Exports use
 * the Paper value, because paper is white. Every text color meets 4.5:1 on each theme's page and
 * surface, and every highlight keeps the theme's text at 4.5:1 or more (tests/unit/palette.test.ts).
 */

export interface Swatch {
  id: string;
  label: string;
  values: Readonly<Record<ResolvedTheme, string>>;
}

export const TEXT_COLORS: readonly Swatch[] = [
  { id: 'rose', label: 'Rose', values: { paper: '#c52e48', sepia: '#b72b42', ink: '#d8586d' } },
  { id: 'ember', label: 'Ember', values: { paper: '#b5462a', sepia: '#a74127', ink: '#d36144' } },
  { id: 'amber', label: 'Amber', values: { paper: '#8c6121', sepia: '#825a1f', ink: '#ae7929' } },
  { id: 'moss', label: 'Moss', values: { paper: '#42771c', sepia: '#3d6e1a', ink: '#519322' } },
  { id: 'teal', label: 'Teal', values: { paper: '#1c776a', sepia: '#1a6d62', ink: '#229384' } },
  { id: 'sky', label: 'Sky', values: { paper: '#266fa3', sepia: '#236696', ink: '#2f89c9' } },
  { id: 'iris', label: 'Iris', values: { paper: '#5a5ad8', sepia: '#4f4fd6', ink: '#7878df' } },
  { id: 'plum', label: 'Plum', values: { paper: '#aa2ec3', sepia: '#9d2ab5', ink: '#c155d7' } },
  { id: 'slate', label: 'Slate', values: { paper: '#5b6b82', sepia: '#546379', ink: '#73859e' } },
];

export const HIGHLIGHTS: readonly Swatch[] = [
  { id: 'yellow', label: 'Yellow', values: { paper: '#f3e27e', sepia: '#f3e27e', ink: '#685f27' } },
  { id: 'peach', label: 'Peach', values: { paper: '#f5c4a3', sepia: '#f5c4a3', ink: '#684127' } },
  { id: 'pink', label: 'Pink', values: { paper: '#f5a3be', sepia: '#f5a3be', ink: '#68273d' } },
  { id: 'lilac', label: 'Lilac', values: { paper: '#cca3f5', sepia: '#cca3f5', ink: '#472768' } },
  { id: 'mint', label: 'Mint', values: { paper: '#8ef0bd', sepia: '#8ef0bd', ink: '#276847' } },
  { id: 'sky', label: 'Sky', values: { paper: '#a3daf5', sepia: '#a3daf5', ink: '#275268' } },
];

export type SwatchKind = 'text' | 'mark';

export function swatchVar(kind: SwatchKind, id: string): string {
  return `var(--vlo-${kind}-${id})`;
}

const VAR = /^var\(--vlo-(text|mark)-([a-z]+)\)$/;

/** The swatch behind a stored value, or undefined for a custom color. */
export function swatchOf(value: string): { kind: SwatchKind; swatch: Swatch } | undefined {
  const match = VAR.exec(value.trim());
  if (!match) return undefined;
  const [, kind, id] = match;
  const list = kind === 'text' ? TEXT_COLORS : HIGHLIGHTS;
  const swatch = list.find((s) => s.id === id);
  return swatch ? { kind: kind as SwatchKind, swatch } : undefined;
}

/** A stored color as a plain color for one theme. Custom colors pass through unchanged. */
export function resolveColor(value: string, theme: ResolvedTheme): string {
  return swatchOf(value)?.swatch.values[theme] ?? value;
}

/** The CSS variables for every swatch, one block per theme. */
export function paletteCss(): string {
  const themes: ResolvedTheme[] = ['ink', 'paper', 'sepia'];
  return themes
    .map((theme) => {
      const lines = [
        ...TEXT_COLORS.map((s) => `--vlo-text-${s.id}: ${s.values[theme]};`),
        ...HIGHLIGHTS.map((s) => `--vlo-mark-${s.id}: ${s.values[theme]};`),
      ];
      return `[data-theme='${theme}'] { ${lines.join(' ')} }`;
    })
    .join('\n');
}

const STYLE_ID = 'vlo-palette';

/** Adds the palette variables to the page once. The editor chunk calls it when it loads. */
export function ensurePaletteStyles(): void {
  if (typeof document === 'undefined' || document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = paletteCss();
  document.head.append(style);
}

/** Each theme's page colors, the same values as themes.css (tests/unit/palette.test.ts checks them). */
export const PAGE_COLORS: Readonly<Record<ResolvedTheme, { bg: string; surface: string; text: string }>> = {
  ink: { bg: '#0e0d0c', surface: '#171513', text: '#efe8dc' },
  paper: { bg: '#f5f1e8', surface: '#fbf8f2', text: '#1c1a17' },
  sepia: { bg: '#efe3cc', surface: '#f6ecd9', text: '#3a2e22' },
};

/** The theme on screen now. Paper when no theme is set, such as in a test. */
export function currentTheme(): ResolvedTheme {
  const theme = typeof document === 'undefined' ? undefined : document.documentElement.dataset.theme;
  return theme === 'ink' || theme === 'sepia' ? theme : 'paper';
}
