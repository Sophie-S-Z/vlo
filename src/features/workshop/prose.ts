/*
 * The prose tools of the Workshop (Phase 17 decision D1).
 *
 * - Spine: the first sentence of each paragraph, section by section. Read in order, the first sentences of
 *   a good essay or article make its argument on their own. A gap shows where a paragraph has no point.
 * - Headline lab: the headline ideas of an article, each with its length.
 */

const segmenters = new Map<string, Intl.Segmenter>();

/** The first sentence of a paragraph. */
export function firstSentence(paragraph: string, language?: string): string {
  const text = paragraph.replace(/\s+/g, ' ').trim();
  if (text === '') return '';
  try {
    const key = language ?? '';
    let sentences = segmenters.get(key);
    if (!sentences) {
      sentences = new Intl.Segmenter(language, { granularity: 'sentence' });
      segmenters.set(key, sentences);
    }
    const first = sentences.segment(text)[Symbol.iterator]().next().value?.segment ?? text;
    return first.trim();
  } catch {
    return /^.*?[.!?](?=\s|$)/.exec(text)?.[0] ?? text;
  }
}

export interface SpineSection {
  id: string;
  title: string;
  /** The first sentence of each paragraph, in order. */
  points: string[];
}

/**
 * The spine of each section, from its stored plain text, where a blank line ends a paragraph. A line with
 * no end mark and fewer than eight words is a heading, not a paragraph.
 */
export function spine(
  sections: readonly { id: string; title: string; text: string }[],
  language?: string,
): SpineSection[] {
  return sections.map((section) => ({
    id: section.id,
    title: section.title,
    points: section.text
      .split(/\n\s*\n/)
      .map((p) => p.trim())
      .filter((p) => p !== '' && !(p.split(/\s+/).length < 8 && !/[.!?…"”’)]$/.test(p)))
      .map((p) => firstSentence(p, language)),
  }));
}

export interface HeadlineCheck {
  characters: number;
  words: number;
  /** Notes on the length, for the writer to weigh. */
  notes: string[];
}

/** About where a search result cuts a page title. */
export const SEARCH_TITLE_CHARACTERS = 60;

export function checkHeadline(headline: string): HeadlineCheck {
  const text = headline.replace(/\s+/g, ' ').trim();
  const characters = Array.from(text).length;
  const words = text === '' ? 0 : text.split(' ').length;
  const notes: string[] = [];
  if (characters > SEARCH_TITLE_CHARACTERS)
    notes.push(`Search results often cut a title after about ${String(SEARCH_TITLE_CHARACTERS)} characters.`);
  if (words > 0 && words < 4) notes.push('A very short headline can leave out what the piece is about.');
  if (/[!?]{2,}/.test(text)) notes.push('More than one ! or ? can read as shouting.');
  return { characters, words, notes };
}
