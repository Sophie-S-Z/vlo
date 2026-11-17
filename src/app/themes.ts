import type { ResolvedTheme, ThemeChoice } from './preferences';

/*
 * What each theme is. A plain theme colors the page. An atmosphere also paints a scene behind the whole app
 * (src/styles/atmospheres.css): the art stays at the edges, so the middle of the screen stays quiet for text.
 * Its small lights move only while the writer rests, and Calm mode and reduced motion keep them still.
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
    hint: 'Moss and pine at dusk, with light through the trees and fireflies.',
    tone: 'dark',
    palette: 'ink',
    atmosphere: true,
  },
  galaxy: {
    label: 'Mystic galaxy',
    hint: 'Violet nebulae and slow stars.',
    tone: 'dark',
    palette: 'ink',
    atmosphere: true,
  },
  'deep-sea': {
    label: 'Deep sea',
    hint: 'Light from far above, and small glowing things that drift up.',
    tone: 'dark',
    palette: 'ink',
    atmosphere: true,
  },
  candlelight: {
    label: 'Candlelight',
    hint: 'A warm room after dark, lit by one flame.',
    tone: 'dark',
    palette: 'ink',
    atmosphere: true,
  },
  wonderland: {
    label: 'Wonderland',
    hint: 'Lavender, pastel blooms and a checkered corner.',
    tone: 'light',
    palette: 'paper',
    atmosphere: true,
  },
  blossom: {
    label: 'Blossom',
    hint: 'A spring garden, with petals that drift past.',
    tone: 'light',
    palette: 'paper',
    atmosphere: true,
  },
  frost: {
    label: 'Frost',
    hint: 'A cold, clear morning, with slow snow.',
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
