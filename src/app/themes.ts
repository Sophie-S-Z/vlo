import type { ResolvedTheme, ThemeChoice } from './preferences';

/*
 * What each theme is. A plain theme colors the page. An atmosphere also puts a photograph behind the whole
 * app (src/styles/atmospheres.css), under a veil of the theme color that keeps the text easy to read. The
 * photograph drifts only while the writer rests, and Calm mode and reduced motion keep it still.
 */

/** The four base palettes. Each theme borrows the text colors and highlights of one (format/palette.ts). */
export type PaletteBase = 'ink' | 'paper' | 'sepia' | 'contrast';

export interface ThemeInfo {
  label: string;
  hint: string;
  /** Dark themes draw light text on a dark page. */
  tone: 'dark' | 'light';
  palette: PaletteBase;
  atmosphere: boolean;
}

export const THEMES: Readonly<Record<ResolvedTheme, ThemeInfo>> = {
  ink: { label: 'Ink', hint: 'Light text on a dark page.', tone: 'dark', palette: 'ink', atmosphere: false },
  paper: {
    label: 'Paper',
    hint: 'Dark text on a light page.',
    tone: 'light',
    palette: 'paper',
    atmosphere: false,
  },
  sepia: {
    label: 'Sepia',
    hint: 'Brown text on a warm page.',
    tone: 'light',
    palette: 'sepia',
    atmosphere: false,
  },
  contrast: {
    label: 'Contrast',
    hint: 'Black text on a white page, with the strongest contrast.',
    tone: 'light',
    palette: 'contrast',
    atmosphere: false,
  },
  forest: {
    label: 'Deep forest',
    hint: 'Pines in fog after sundown.',
    tone: 'dark',
    palette: 'ink',
    atmosphere: true,
  },
  galaxy: {
    label: 'Mystic galaxy',
    hint: 'The Milky Way over a dark ridge.',
    tone: 'dark',
    palette: 'ink',
    atmosphere: true,
  },
  'deep-sea': {
    label: 'Deep sea',
    hint: 'Sunlight on the sea floor, far below the waves.',
    tone: 'dark',
    palette: 'ink',
    atmosphere: true,
  },
  candlelight: {
    label: 'Candlelight',
    hint: 'Tall candles in a dark room, with a soft flicker.',
    tone: 'dark',
    palette: 'ink',
    atmosphere: true,
  },
  wonderland: {
    label: 'Wonderland',
    hint: 'A curtain of wisteria in soft light.',
    tone: 'light',
    palette: 'paper',
    atmosphere: true,
  },
  blossom: {
    label: 'Blossom',
    hint: 'A cherry branch against a pale spring sky.',
    tone: 'light',
    palette: 'paper',
    atmosphere: true,
  },
  frost: {
    label: 'Frost',
    hint: 'Ice ferns on a window pane.',
    tone: 'light',
    palette: 'paper',
    atmosphere: true,
  },
};

export function themeLabel(choice: ThemeChoice): string {
  return choice === 'system' ? 'System' : THEMES[choice].label;
}

export function themeHint(choice: ThemeChoice): string {
  return choice === 'system' ? 'Follows your device: Ink when dark, Paper when light.' : THEMES[choice].hint;
}
