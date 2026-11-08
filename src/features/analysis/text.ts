/*
 * Text units for the analysis tools: paragraphs, sentences and words, each with its place in the text, so a
 * report can mark the exact words. Pure functions with no app imports, so the analysis worker, the
 * training script and the tests share them.
 */

export interface Span {
  from: number;
  to: number;
}

export interface Word extends Span {
  text: string;
  /** The word in lower case, with curly apostrophes made straight. */
  lower: string;
}

export interface Sentence extends Span {
  text: string;
  /** The index of the paragraph that holds the sentence. */
  paragraph: number;
  words: Word[];
}

/**
 * The text with each curly quote made straight and each no-break space made a plain space. Each change keeps
 * the length, so places in the result are places in the source.
 */
export function plainChars(text: string): string {
  return text
    .replace(/[\u2018\u2019\u201A\u201B\u2032]/g, "'")
    .replace(/[\u201C\u201D\u201E\u201F\u2033]/g, '"')
    .replace(/[\u00A0\u2007\u202F]/g, ' ');
}

let wordSegmenter: Intl.Segmenter | null = null;
let sentenceSegmenter: Intl.Segmenter | null = null;

/** The words of a text: the word-like segments, with their places. */
export function wordsOf(text: string, offset = 0): Word[] {
  wordSegmenter ??= new Intl.Segmenter('en', { granularity: 'word' });
  const found: Word[] = [];
  for (const part of wordSegmenter.segment(text)) {
    if (!part.isWordLike) continue;
    const from = offset + part.index;
    found.push({
      text: part.segment,
      lower: part.segment.toLowerCase().replace(/\u2019/g, "'"),
      from,
      to: from + part.segment.length,
    });
  }
  return found;
}

/** The paragraphs of a text: each run of lines with text. A blank line or a line break ends a paragraph. */
export function paragraphsOf(text: string): Span[] {
  const found: Span[] = [];
  const line = /[^\n]+/g;
  for (let match = line.exec(text); match !== null; match = line.exec(text)) {
    const raw = match[0];
    if (raw.trim() === '') continue;
    const lead = raw.length - raw.trimStart().length;
    const from = match.index + lead;
    found.push({ from, to: from + raw.trim().length });
  }
  return found;
}

/** The sentences of a text, paragraph by paragraph. A part with no letter or digit is not a sentence. */
export function sentencesOf(text: string): Sentence[] {
  const splitter = (sentenceSegmenter ??= new Intl.Segmenter('en', { granularity: 'sentence' }));
  const found: Sentence[] = [];
  paragraphsOf(text).forEach((paragraph, index) => {
    const body = text.slice(paragraph.from, paragraph.to);
    for (const part of splitter.segment(body)) {
      const trimmed = part.segment.trimEnd();
      if (!/[\p{L}\p{N}]/u.test(trimmed)) continue;
      const from = paragraph.from + part.index;
      found.push({
        text: trimmed,
        paragraph: index,
        from,
        to: from + trimmed.length,
        words: wordsOf(trimmed, from),
      });
    }
  });
  return found;
}

export function mean(values: readonly number[]): number {
  if (values.length === 0) return 0;
  let sum = 0;
  for (const value of values) sum += value;
  return sum / values.length;
}

export function deviation(values: readonly number[]): number {
  if (values.length < 2) return 0;
  const middle = mean(values);
  let sum = 0;
  for (const value of values) sum += (value - middle) ** 2;
  return Math.sqrt(sum / values.length);
}
