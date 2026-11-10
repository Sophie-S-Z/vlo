import type { CiteStyle, Source, SourceName } from '@/lib/db';

/*
 * Vlo's own citation formatter (roadmap 2 decision R3, plan Tasks M6 and M7): the in-text citation of
 * APA 7, MLA 9 and Chicago author-date (18th edition), for a book, a chapter, an article and a web page.
 */

export const CITE_STYLE_LABELS: Readonly<Record<CiteStyle, string>> = {
  apa: 'APA 7',
  mla: 'MLA 9',
  chicago: 'Chicago author-date',
};

/** The text of a citation whose source the writer deleted. */
export const MISSING_SOURCE = '[missing source]';

/** Page numbers with an en dash between the first and the last. */
export const pageRange = (pages: string) => pages.trim().replace(/\s*[-–]+\s*/g, '–');

/** "Marlow", "Marlow & Quill" (APA) or "Marlow and Quill", and "Marlow et al." for three or more. */
function familyNames(names: readonly SourceName[], and: string): string {
  const [first, second] = names;
  if (!first) return '';
  if (names.length === 1) return first.family;
  if (names.length === 2 && second) return `${first.family} ${and} ${second.family}`;
  return `${first.family} et al.`;
}

/** A work with no author goes by its title: a book as it is, a shorter work in quotation marks. */
const titleOf = (source: Source) => (source.type === 'book' ? source.title : `“${source.title}”`);

/** The in-text citation of a source, such as "(Marlow & Quill, 2019, p. 12)" in APA. */
export function inText(source: Source | undefined, page: string, style: CiteStyle): string {
  if (!source) return MISSING_SOURCE;
  const at = pageRange(page);
  const year = source.year ?? 'n.d.';
  const who = familyNames(source.authors, style === 'apa' ? '&' : 'and') || titleOf(source);
  switch (style) {
    case 'apa': {
      // A comma after a quoted title goes inside the quotation marks.
      const lead = who.endsWith('”') ? `${who.slice(0, -1)},”` : `${who},`;
      return `(${lead} ${year}${at ? `, ${/[–,]/.test(at) ? 'pp.' : 'p.'} ${at}` : ''})`;
    }
    case 'mla':
      return `(${who}${at ? ` ${at}` : ''})`;
    case 'chicago':
      return `(${who} ${year}${at ? `, ${at}` : ''})`;
  }
}
