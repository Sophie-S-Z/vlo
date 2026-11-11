import type { CiteStyle, Source, SourceName } from '@/lib/db';
import type { Run } from '@/features/export/model';

/*
 * Vlo's own citation formatter (roadmap 2 decision R3, plan Tasks M6 and M7): the in-text citation and
 * the reference list entry of APA 7, MLA 9 and Chicago author-date (18th edition), for a book, a chapter,
 * an article and a web page. A title keeps the case that the writer typed.
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

/** True when the style puts the title in quotation marks: a part of a larger work. APA sets a web page in italics. */
const quoted = (source: Source, style: CiteStyle) =>
  source.type === 'chapter' || source.type === 'article' || (source.type === 'web' && style !== 'apa');

/** A work with no author goes by its title, in quotation marks when it is part of a larger work. */
const titleOf = (source: Source, style: CiteStyle) =>
  quoted(source, style) ? `“${source.title}”` : source.title;

/** The in-text citation of a source, such as "(Marlow & Quill, 2019, p. 12)" in APA. */
export function inText(source: Source | undefined, page: string, style: CiteStyle): string {
  if (!source) return MISSING_SOURCE;
  const at = pageRange(page);
  const year = source.year ?? 'n.d.';
  const who = familyNames(source.authors, style === 'apa' ? '&' : 'and') || titleOf(source, style);
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

/* ------------------------------------------------------------------ Reference list */

/** The heading of the reference list. */
export const LIST_TITLES: Readonly<Record<CiteStyle, string>> = {
  apa: 'References',
  mla: 'Works Cited',
  chicago: 'References',
};

/** A piece of an entry: plain text, or a title in italics. */
type Part = string | { italic: string };

/** Ends a part with a period, unless it ends with a period, a question mark or an exclamation mark. */
const stop = (text: string) => (/[.?!]$/.test(text) ? text : `${text}.`);

/** A title in quotation marks, with the period inside them. */
const inQuotes = (title: string) => `“${stop(title)}” `;

/** A title in italics, with the period after it in plain type. */
const inItalics = (title: string): Part[] => [{ italic: title }, /[.?!]$/.test(title) ? ' ' : '. '];

/** "A. M." from "Ada Mae", and "J.-P." from "Jean-Paul". */
const initials = (given: string) =>
  given
    .split(/\s+/)
    .filter(Boolean)
    .map((word) =>
      word
        .split('-')
        .map((part) => `${part.charAt(0)}.`)
        .join('-'),
    )
    .join(' ');

/** "A, B, & C" (APA) or "A, B, and C", with no comma between two names when `pairComma` is off. */
function joinNames(names: readonly string[], and: string, pairComma: boolean): string {
  if (names.length <= 1) return names[0] ?? '';
  if (names.length === 2) return `${names[0] ?? ''}${pairComma ? ',' : ''} ${and} ${names[1] ?? ''}`;
  return `${names.slice(0, -1).join(', ')}, ${and} ${names.at(-1) ?? ''}`;
}

const inverted = (name: SourceName) => (name.given ? `${name.family}, ${name.given}` : name.family);
const natural = (name: SourceName) => (name.given ? `${name.given} ${name.family}` : name.family);

/** The authors at the start of an entry, or an empty text when there are none. */
function authorList(names: readonly SourceName[], style: CiteStyle): string {
  if (names.length === 0) return '';
  switch (style) {
    case 'apa': {
      const each = names.map((n) => (n.given ? `${n.family}, ${initials(n.given)}` : n.family));
      // Up to 20 authors. With more, the first 19, an ellipsis and the last.
      if (each.length > 20) return `${each.slice(0, 19).join(', ')}, . . . ${each.at(-1) ?? ''}`;
      return joinNames(each, '&', true);
    }
    case 'mla': {
      const [first, second] = names;
      if (!first) return '';
      if (names.length >= 3) return `${inverted(first)}, et al`;
      return second ? `${inverted(first)}, and ${natural(second)}` : inverted(first);
    }
    case 'chicago': {
      // Up to six authors. With more, the first three and "et al."
      const listed = names.length > 6 ? names.slice(0, 3) : names;
      const each = listed.map((n, i) => (i === 0 ? inverted(n) : natural(n)));
      if (names.length > 6) return `${each.join(', ')}, et al`;
      return joinNames(each, 'and', true);
    }
  }
}

/** The editors of a chapter's book: "M. Hale (Ed.)" in APA, "Mina Hale" in MLA and Chicago. */
function editorList(names: readonly SourceName[], style: CiteStyle): string {
  if (style === 'apa') {
    const each = names.map((n) => (n.given ? `${initials(n.given)} ${n.family}` : n.family));
    return `${joinNames(each, '&', false)} (${names.length === 1 ? 'Ed.' : 'Eds.'})`;
  }
  if (style === 'mla' && names.length >= 3) return `${natural(names[0] ?? { family: '' })} et al.`;
  return joinNames(names.map(natural), 'and', false);
}

/**
 * MLA's page range: the second number in full up to 99, and above that only its last two digits, or
 * more when they are needed. So 201–19, 398–401 and 1003–05.
 */
export function mlaPages(pages: string): string {
  const range = pageRange(pages);
  const match = /^(\d+)–(\d+)$/.exec(range);
  if (!match) return range;
  const [, from = '', to = ''] = match;
  if (Number(from) < 100 || from.length !== to.length) return range;
  let keep = 2;
  while (keep < to.length && from.slice(0, to.length - keep) !== to.slice(0, to.length - keep)) keep += 1;
  return `${from}–${to.slice(-keep)}`;
}

const link = (source: Source) => (source.doi ? `https://doi.org/${source.doi}` : source.url);

function apaEntry(s: Source): Part[] {
  const who = authorList(s.authors, 'apa');
  const date = `(${s.year ?? 'n.d.'}). `;
  const own = s.type === 'book' || s.type === 'web';
  const title: Part[] = own ? inItalics(s.title) : [`${stop(s.title)} `];
  // With no author, the title takes the author's place.
  const parts: Part[] = who ? [`${stop(who)} ${date}`, ...title] : [...title, date];
  if (s.type === 'chapter') {
    parts.push('In ', ...(s.editors?.length ? [`${editorList(s.editors, 'apa')}, `] : []));
    parts.push({ italic: s.container ?? '' }, s.pages ? ` (pp. ${pageRange(s.pages)}). ` : '. ');
  }
  if (s.type === 'article' && s.container) {
    parts.push({ italic: s.container });
    if (s.volume) parts.push(', ', { italic: s.volume }, s.issue ? `(${s.issue})` : '');
    parts.push(s.pages ? `, ${pageRange(s.pages)}. ` : '. ');
  }
  if (s.type === 'web' && s.container && s.container !== who) parts.push(`${stop(s.container)} `);
  if ((s.type === 'book' || s.type === 'chapter') && s.publisher) parts.push(`${stop(s.publisher)} `);
  const at = link(s);
  if (at) parts.push(at);
  return parts;
}

function mlaEntry(s: Source): Part[] {
  const who = authorList(s.authors, 'mla');
  const parts: Part[] = who ? [`${stop(who)} `] : [];
  parts.push(...(quoted(s, 'mla') ? [inQuotes(s.title)] : inItalics(s.title)));
  // The other elements follow, with a comma after each.
  const rest: Part[][] = [];
  if (s.container) rest.push([{ italic: s.container }]);
  if (s.type === 'chapter' && s.editors?.length) rest.push([`edited by ${editorList(s.editors, 'mla')}`]);
  if (s.type === 'article') {
    if (s.volume) rest.push([`vol. ${s.volume}`]);
    if (s.issue) rest.push([`no. ${s.issue}`]);
  }
  if ((s.type === 'book' || s.type === 'chapter') && s.publisher) rest.push([s.publisher]);
  if (s.year) rest.push([s.year]);
  if (s.pages) rest.push([`${pageRange(s.pages).includes('–') ? 'pp.' : 'p.'} ${mlaPages(s.pages)}`]);
  const at = link(s);
  if (at) rest.push([at]);
  rest.forEach((part, i) => {
    parts.push(...part, i === rest.length - 1 ? '.' : ', ');
  });
  return parts;
}

function chicagoEntry(s: Source): Part[] {
  const who = authorList(s.authors, 'chicago');
  const date = `${s.year ?? 'n.d.'}. `;
  const title: Part[] = quoted(s, 'chicago') ? [inQuotes(s.title)] : inItalics(s.title);
  const parts: Part[] = who ? [`${stop(who)} ${date}`, ...title] : [...title, date];
  if (s.type === 'chapter') {
    parts.push('In ', { italic: s.container ?? '' });
    parts.push(s.editors?.length ? `, edited by ${editorList(s.editors, 'chicago')}. ` : '. ');
  }
  if (s.type === 'article' && s.container) {
    parts.push({ italic: s.container });
    if (s.volume) parts.push(` ${s.volume}`, s.issue ? ` (${s.issue})` : '');
    parts.push(s.pages ? `: ${pageRange(s.pages)}. ` : '. ');
  }
  if (s.type === 'web' && s.container) parts.push(`${stop(s.container)} `);
  if ((s.type === 'book' || s.type === 'chapter') && s.publisher) parts.push(`${stop(s.publisher)} `);
  const at = link(s);
  if (at) parts.push(stop(at));
  return parts;
}

/** The entry of a source in the reference list, as runs with each title in italics. */
export function reference(source: Source, style: CiteStyle): Run[] {
  const parts =
    style === 'apa' ? apaEntry(source) : style === 'mla' ? mlaEntry(source) : chicagoEntry(source);
  const runs: Run[] = [];
  for (const part of parts) {
    const italic = typeof part !== 'string';
    const text = typeof part === 'string' ? part : part.italic;
    if (text === '') continue;
    const last = runs.at(-1);
    if (last?.type === 'text' && (last.style.italic === true) === italic) last.text += text;
    else runs.push({ type: 'text', text, style: italic ? { italic: true } : {} });
  }
  const end = runs.at(-1);
  if (end?.type === 'text') end.text = end.text.trimEnd();
  return runs;
}

/** The sources in the order of the reference list: by the first author, then the year, then the title. */
export function sortReferences(sources: readonly Source[], language: string): Source[] {
  const sortKey = (s: Source) => [
    s.authors[0]?.family ?? s.title.replace(/^(?:the|a|an)\s+/i, ''),
    s.year ?? '',
    s.title,
  ];
  const collator = new Intl.Collator(language, { sensitivity: 'base' });
  return [...sources].sort((a, b) => {
    const [x, y] = [sortKey(a), sortKey(b)];
    for (let i = 0; i < x.length; i += 1) {
      const order = collator.compare(x[i] ?? '', y[i] ?? '');
      if (order !== 0) return order;
    }
    return 0;
  });
}
