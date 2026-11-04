import { fontLabel, localFontName } from '@/features/editor/format/fonts';
import type { ExportDoc } from './model';
import { usedFonts } from './notices';
import { embedProblem, standInFor } from './pdf/fonts';

/*
 * The writer's own fonts in a PDF or EPUB (plan decision 7). A font goes into the file only when Vlo can
 * read its bytes and its license allows embedding. Every other own font is swapped for the closest Vlo
 * font, and the export dialog names each swap before the file is made.
 */

export interface FontSwap {
  /** The stored font value, "local:" and the font name. */
  value: string;
  /** The writer's font name. */
  name: string;
  /** The Vlo font id that stands in for it. */
  standIn: string;
  standInName: string;
  /** Why the font cannot go in the file, as a sentence. */
  reason: string;
}

export interface FontCheck {
  /** Own fonts that go in the file, by stored value. */
  own: Map<string, Uint8Array>;
  swaps: FontSwap[];
}

/** The writer's own fonts that an export uses, by stored value. */
export function ownFontsOf(doc: ExportDoc): string[] {
  return usedFonts(doc).filter((value) => localFontName(value) !== null);
}

/** Sorts the own fonts into the ones that go in the file and the ones that need a stand-in. */
export function checkOwnFonts(
  values: readonly string[],
  bytes: ReadonlyMap<string, Uint8Array | null>,
): FontCheck {
  const own = new Map<string, Uint8Array>();
  const swaps: FontSwap[] = [];
  for (const value of values) {
    const name = localFontName(value) ?? value;
    const data = bytes.get(value) ?? undefined;
    const problem = embedProblem(data);
    if (data && problem === null) {
      own.set(value, data);
      continue;
    }
    const standIn = standInFor(name, data);
    swaps.push({
      value,
      name,
      standIn,
      standInName: fontLabel(standIn),
      reason: problem ?? 'Vlo cannot read this font.',
    });
  }
  return { own, swaps };
}
