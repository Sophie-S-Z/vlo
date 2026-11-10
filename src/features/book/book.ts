import type { BookSettings, Project, Trim } from '@/lib/db';

/*
 * Book layout (roadmap F51, plan Task J4). A PDF or EPUB with book layout reads these settings. Sizes are in
 * PDF points, 72 to the inch.
 */

export const DEFAULT_BOOK: BookSettings = {
  trim: '5.5x8.5',
  chapter: 'classic',
  sceneBreak: 'stars',
  dropCaps: true,
  contents: true,
  copyright: '',
  dedication: '',
  epigraph: '',
  acknowledgments: '',
  about: '',
};

/** The project's book settings, with the default for each one that it does not have. */
export function bookOf(project: Pick<Project, 'settings'>): BookSettings {
  return { ...DEFAULT_BOOK, ...project.settings.book };
}

const INCH = 72;

/** The width and height of a page of each trim. */
export const TRIM_POINTS: Record<Trim, readonly [number, number]> = {
  '5x8': [5 * INCH, 8 * INCH],
  '5.25x8': [5.25 * INCH, 8 * INCH],
  '5.5x8.5': [5.5 * INCH, 8.5 * INCH],
  '6x9': [6 * INCH, 9 * INCH],
  a5: [419.53, 595.28],
};

/** The least inside margin for a book of this many pages, by the KDP print table. */
export function gutterFor(pages: number): number {
  const inches =
    pages <= 150 ? 0.375 : pages <= 300 ? 0.5 : pages <= 500 ? 0.625 : pages <= 700 ? 0.75 : 0.875;
  return inches * INCH;
}

/** The margins of a book page. The inside margin adds a quarter inch to the gutter, so no word sinks into the fold. */
export function bookMargins(pages: number): { inside: number; outside: number; top: number; bottom: number } {
  return { inside: gutterFor(pages) + INCH / 4, outside: 0.5 * INCH, top: 0.75 * INCH, bottom: 0.75 * INCH };
}
