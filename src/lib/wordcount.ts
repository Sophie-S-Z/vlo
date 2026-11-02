const segmenters = new Map<string, Intl.Segmenter>();

function segmenter(locale: string | undefined): Intl.Segmenter {
  const key = locale ?? '';
  let found = segmenters.get(key);
  if (!found) {
    found = new Intl.Segmenter(locale, { granularity: 'word' });
    segmenters.set(key, found);
  }
  return found;
}

/** Counts word-like segments (VLO_SPEC section 5). Works for languages with and without spaces. */
export function countWords(text: string, locale?: string): number {
  let count = 0;
  for (const part of segmenter(locale).segment(text)) if (part.isWordLike) count += 1;
  return count;
}

/** Counts lines that hold any non-space text, as poem line counts do. */
export function countLines(text: string): number {
  let count = 0;
  for (const line of text.split('\n')) if (line.trim() !== '') count += 1;
  return count;
}
