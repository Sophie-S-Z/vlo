import type { PageLineKind, PageSetup } from '@/lib/db';

/*
 * Page setup (Phase 19, Task F3): the margins, the page numbers, and a line at the top and the foot of each
 * page. The page on the screen and each export with pages read the same values from here.
 */

export type Margins = NonNullable<PageSetup['custom']>;
export type MarginPreset = PageSetup['margins'];

/** The margins of each preset in inches, as Word names them. */
export const MARGIN_PRESETS: Readonly<Record<Exclude<MarginPreset, 'custom'>, Margins>> = {
  normal: { top: 1, right: 1, bottom: 1, left: 1 },
  narrow: { top: 0.5, right: 0.5, bottom: 0.5, left: 0.5 },
  wide: { top: 1, right: 2, bottom: 1, left: 2 },
};

export const MARGIN_LABELS: Readonly<Record<MarginPreset, string>> = {
  normal: 'Normal',
  narrow: 'Narrow',
  wide: 'Wide',
  custom: 'Custom',
};

/** The smallest and the largest margin in inches. Letter and A4 keep more than 2 inches of text between. */
export const MIN_MARGIN = 0.25;
export const MAX_MARGIN = 3;

/** The longest own text of a page line. */
export const MAX_PAGE_LINE = 120;

export const DEFAULT_PAGE_SETUP: PageSetup = {
  margins: 'normal',
  numbers: 'bottom-center',
  header: 'none',
  footer: 'none',
};

const PRESETS = ['normal', 'narrow', 'wide', 'custom'] as const;
const NUMBERS = ['none', 'bottom-center', 'top-right'] as const;
const LINES = ['none', 'project', 'item', 'own'] as const;

function isMargin(value: unknown): value is number {
  return typeof value === 'number' && value >= MIN_MARGIN && value <= MAX_MARGIN;
}

function oneOf<T extends string>(list: readonly T[], value: unknown): value is T {
  return (list as readonly unknown[]).includes(value);
}

/** The page setup of stored settings, or null when a value is wrong. A missing setup is the default. */
export function cleanPageSetup(value: unknown): PageSetup | null {
  if (value === undefined) return DEFAULT_PAGE_SETUP;
  if (typeof value !== 'object' || value === null) return null;
  const v = value as Record<string, unknown>;
  const custom = v.custom as Record<string, unknown> | null | undefined;
  const text = (t: unknown) => t === undefined || (typeof t === 'string' && t.length <= MAX_PAGE_LINE);
  if (
    !oneOf(PRESETS, v.margins) ||
    !oneOf(NUMBERS, v.numbers) ||
    !oneOf(LINES, v.header) ||
    !oneOf(LINES, v.footer) ||
    !(v.unit === undefined || v.unit === 'in' || v.unit === 'mm') ||
    !text(v.headerText) ||
    !text(v.footerText) ||
    !(
      custom === undefined ||
      (typeof custom === 'object' &&
        custom !== null &&
        [custom.top, custom.right, custom.bottom, custom.left].every(isMargin))
    )
  )
    return null;
  return value as PageSetup;
}

/** The four margins of a page setup, in inches. */
export function marginsOf(setup: PageSetup): Margins {
  return setup.margins === 'custom' ? (setup.custom ?? MARGIN_PRESETS.normal) : MARGIN_PRESETS[setup.margins];
}

/** The names that a page line can show. */
export interface PageLineNames {
  project: string;
  item: string;
}

/** The text of a page line, or an empty text for none. */
export function pageLineText(kind: PageLineKind, own: string | undefined, names: PageLineNames): string {
  if (kind === 'project') return names.project;
  if (kind === 'item') return names.item;
  if (kind === 'own') return own?.trim() ?? '';
  return '';
}

/** A margin in the unit of the setup, rounded for a field: 2 places in inches, whole millimeters. */
export function shownMargin(inches: number, unit: 'in' | 'mm'): number {
  return unit === 'mm' ? Math.round(inches * 25.4) : Math.round(inches * 100) / 100;
}

/** A margin typed in a unit, in inches, kept between the smallest and the largest margin. */
export function typedMargin(value: number, unit: 'in' | 'mm'): number {
  const inches = unit === 'mm' ? value / 25.4 : value;
  return Math.min(Math.max(inches, MIN_MARGIN), MAX_MARGIN);
}
