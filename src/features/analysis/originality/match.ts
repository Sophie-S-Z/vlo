import { matchNames } from '@/lib/privacy';
import { STOP_WORDS } from '../stats';
import { sentencesOf, type Span } from '../text';

/*
 * The originality check: it finds the parts of a text that match a source, as Turnitin's similarity
 * report does. Two kinds of match count:
 *
 * - Copied text: a run of at least `minWords` words in the same order as the source. Case, punctuation and
 *   small changes of word form ("walk", "walked") do not break a run. The check hashes each run of 5 words
 *   (a shingle), so it stays fast for a whole novel.
 * - Close paraphrase: a sentence that shares most of its content words with one source sentence, in any
 *   order, with no copied run. Changing a few words does not hide a copied sentence.
 *
 * The options match Turnitin's filters: leave out quoted text, leave out a reference list, and leave out
 * matches shorter than a number of words.
 */

export const SHINGLE = 5;

export interface Source {
  id: string;
  title: string;
  /** Where the source came from: the writer's own work, a pasted source, or a web site. */
  origin: 'own' | 'pasted' | 'web';
  url?: string | undefined;
  text: string;
}

export interface MatchOptions {
  /** The fewest words in a copied run. Turnitin's filter default is off; 8 is a common setting. */
  minWords: number;
  excludeQuotes: boolean;
  excludeReferences: boolean;
}

export const DEFAULT_OPTIONS: MatchOptions = { minWords: 8, excludeQuotes: true, excludeReferences: true };

export interface Match extends Span {
  sourceId: string;
  kind: 'copied' | 'paraphrase';
  words: number;
  /** The matching part of the source, for the report. */
  sourceText: string;
}

export interface SourceResult {
  source: Source;
  /** Words of the text that match this source, as a share of all checked words, 0 to 1. */
  share: number;
  words: number;
}

export interface OriginalityReport {
  /** The words that the check covered, after the filters. */
  checkedWords: number;
  /** The share of checked words that match any source, 0 to 1. Each word counts once. */
  similarity: number;
  matches: Match[];
  sources: SourceResult[];
  /** Places that the filters left out. */
  excluded: Span[];
}

interface Token extends Span {
  stem: string;
}

/** A light word stem, so "walks", "walked" and "walking" match "walk". */
export function stem(word: string): string {
  let w = word.toLowerCase().replace(/[\u2019']/g, '');
  if (w.length > 5 && w.endsWith('ing')) w = w.slice(0, -3);
  else if (w.length > 4 && w.endsWith('ied')) w = `${w.slice(0, -3)}y`;
  else if (w.length > 4 && w.endsWith('ed')) w = w.slice(0, -2);
  else if (w.length > 4 && w.endsWith('ies')) w = `${w.slice(0, -3)}y`;
  else if (w.length > 3 && w.endsWith('es') && /(?:ch|sh|ss|x|z)es$/.test(w)) w = w.slice(0, -2);
  else if (w.length > 3 && w.endsWith('s') && !w.endsWith('ss')) w = w.slice(0, -1);
  return w;
}

let segmenter: Intl.Segmenter | null = null;

function tokens(text: string): Token[] {
  segmenter ??= new Intl.Segmenter('en', { granularity: 'word' });
  const found: Token[] = [];
  for (const part of segmenter.segment(text)) {
    if (!part.isWordLike) continue;
    found.push({ from: part.index, to: part.index + part.segment.length, stem: stem(part.segment) });
  }
  return found;
}

/** A 32-bit FNV-1a hash of a string. */
function hash(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function shingleKey(list: readonly Token[], at: number): number {
  let key = '';
  for (let i = at; i < at + SHINGLE; i += 1) key += `${list[i]?.stem ?? ''} `;
  return hash(key);
}

const REFERENCES =
  /^\s*(?:references|works cited|bibliography|sources|works consulted|literature cited)\s*:?\s*$/im;
const QUOTED = /"[^"\n]{1,2000}"|\u201C[^\u201D\n]{1,2000}\u201D/g;

/** The places that the options leave out: quoted text and everything after a reference heading. */
export function excludedSpans(text: string, options: MatchOptions): Span[] {
  const spans: Span[] = [];
  if (options.excludeQuotes)
    for (const m of text.matchAll(QUOTED)) spans.push({ from: m.index, to: m.index + m[0].length });
  if (options.excludeReferences) {
    const m = REFERENCES.exec(text);
    if (m) spans.push({ from: m.index, to: text.length });
  }
  return spans;
}

const inside = (spans: readonly Span[], at: Span) => spans.some((s) => at.from >= s.from && at.to <= s.to);

interface Prepared {
  source: Source;
  tokens: Token[];
  shingles: Map<number, number[]>;
  sentences: { from: number; to: number; content: Set<string> }[];
}

function contentStems(list: readonly Token[]): Set<string> {
  return new Set(list.map((t) => t.stem).filter((s) => s.length > 2 && !STOP_WORDS.has(s)));
}

/** Prepares a source once, so many checks can reuse it. */
export function prepareSource(source: Source): Prepared {
  const list = tokens(source.text);
  const shingles = new Map<number, number[]>();
  for (let i = 0; i + SHINGLE <= list.length; i += 1) {
    const key = shingleKey(list, i);
    const at = shingles.get(key);
    if (at) at.push(i);
    else shingles.set(key, [i]);
  }
  const sentences = sentencesOf(source.text).map((s) => ({
    from: s.from,
    to: s.to,
    content: contentStems(tokens(s.text)),
  }));
  return { source, tokens: list, shingles, sentences };
}

/** Copied runs: the shingles that the text shares with the source, joined where they touch. */
function copiedRuns(
  list: readonly Token[],
  keep: readonly boolean[],
  prepared: Prepared,
): { start: number; end: number; at: number }[] {
  const runs: { start: number; end: number; at: number }[] = [];
  let i = 0;
  while (i + SHINGLE <= list.length) {
    const places = prepared.shingles.get(shingleKey(list, i));
    if (!places || !keep[i]) {
      i += 1;
      continue;
    }
    // Grow the run word by word from the best place in the source.
    let best = { end: i + SHINGLE, at: places[0] ?? 0 };
    for (const at of places) {
      let end = i + SHINGLE;
      let other = at + SHINGLE;
      while (
        end < list.length &&
        other < prepared.tokens.length &&
        keep[end] &&
        list[end]?.stem === prepared.tokens[other]?.stem
      ) {
        end += 1;
        other += 1;
      }
      if (end > best.end) best = { end, at };
    }
    runs.push({ start: i, end: best.end, at: best.at });
    i = best.end;
  }
  return runs;
}

/** Jaccard overlap of two sets of content stems. */
function overlap(a: ReadonlySet<string>, b: ReadonlySet<string>): number {
  let shared = 0;
  for (const value of a) if (b.has(value)) shared += 1;
  const union = a.size + b.size - shared;
  return union === 0 ? 0 : shared / union;
}

/** The checked text against each source. */
export function checkOriginality(
  text: string,
  sources: readonly (Source | Prepared)[],
  options: MatchOptions = DEFAULT_OPTIONS,
): OriginalityReport {
  const excluded = excludedSpans(text, options);
  const list = tokens(text);
  const keep = list.map((token) => !inside(excluded, token));
  const checkedWords = keep.filter(Boolean).length;
  const covered = new Array<boolean>(list.length).fill(false);
  const matches: Match[] = [];
  const perSource = new Map<string, Set<number>>();
  const prepared = sources.map((s) => ('shingles' in s ? s : prepareSource(s)));

  for (const source of prepared) {
    const own = new Set<number>();
    for (const run of copiedRuns(list, keep, source)) {
      const words = run.end - run.start;
      if (words < Math.max(SHINGLE, options.minWords)) continue;
      const first = list[run.start];
      const last = list[run.end - 1];
      const sourceFirst = source.tokens[run.at];
      const sourceLast = source.tokens[run.at + words - 1];
      if (!first || !last || !sourceFirst || !sourceLast) continue;
      for (let i = run.start; i < run.end; i += 1) {
        own.add(i);
        covered[i] = true;
      }
      matches.push({
        sourceId: source.source.id,
        kind: 'copied',
        from: first.from,
        to: last.to,
        words,
        sourceText: source.source.text.slice(sourceFirst.from, sourceLast.to),
      });
    }
    perSource.set(source.source.id, own);
  }

  // Close paraphrase, for sentences with no copied run. An index of content stems finds the candidates.
  const index = new Map<string, { source: Prepared; sentence: number }[]>();
  for (const source of prepared)
    source.sentences.forEach((sentence, at) => {
      for (const value of sentence.content) {
        const entry = index.get(value);
        const hit = { source, sentence: at };
        if (entry) entry.push(hit);
        else index.set(value, [hit]);
      }
    });
  let cursor = 0;
  for (const sentence of sentencesOf(text)) {
    while (cursor < list.length && (list[cursor]?.from ?? 0) < sentence.from) cursor += 1;
    const start = cursor;
    let end = start;
    while (end < list.length && (list[end]?.to ?? 0) <= sentence.to) end += 1;
    const span = list.slice(start, end);
    if (span.length < Math.max(6, Math.ceil(options.minWords * 0.75))) continue;
    const kept = span.filter((_, i) => keep[start + i]);
    if (kept.length < span.length || span.some((_, i) => covered[start + i])) continue;
    const content = contentStems(span);
    if (content.size < 5) continue;
    const votes = new Map<string, { source: Prepared; sentence: number; shared: number }>();
    for (const value of content) {
      const hits = index.get(value);
      if (!hits || hits.length > 200) continue;
      for (const hit of hits) {
        const key = `${hit.source.source.id}:${String(hit.sentence)}`;
        const vote = votes.get(key);
        if (vote) vote.shared += 1;
        else votes.set(key, { ...hit, shared: 1 });
      }
    }
    let best: { source: Prepared; sentence: number; score: number } | null = null;
    for (const vote of votes.values()) {
      if (vote.shared < 4) continue;
      const other = vote.source.sentences[vote.sentence];
      if (!other) continue;
      const score = overlap(content, other.content);
      if (score >= 0.5 && (!best || score > best.score))
        best = { source: vote.source, sentence: vote.sentence, score };
    }
    if (!best) continue;
    const other = best.source.sentences[best.sentence];
    if (!other) continue;
    for (let i = start; i < end; i += 1) {
      covered[i] = true;
      perSource.get(best.source.source.id)?.add(i);
    }
    matches.push({
      sourceId: best.source.source.id,
      kind: 'paraphrase',
      from: sentence.from,
      to: sentence.to,
      words: span.length,
      sourceText: best.source.source.text.slice(other.from, other.to),
    });
  }

  const matchedWords = covered.filter(Boolean).length;
  const results = prepared
    .map((source): SourceResult => {
      const words = perSource.get(source.source.id)?.size ?? 0;
      return { source: source.source, words, share: checkedWords === 0 ? 0 : words / checkedWords };
    })
    .filter((result) => result.words > 0)
    .sort((a, b) => b.words - a.words);
  return {
    checkedWords,
    similarity: checkedWords === 0 ? 0 : matchedWords / checkedWords,
    matches: matches.sort((a, b) => a.from - b.from),
    sources: results,
    excluded,
  };
}

/**
 * Phrases for a web search: up to `limit` runs of 8 to 12 words from different sentences, chosen for
 * their rare, long words, because a search for common words finds nothing useful. Quoted text is left out,
 * and so is each phrase that holds one of `privateNames`, because a real name never leaves the device
 * (spec F17).
 */
export function searchPhrases(
  text: string,
  limit: number,
  options: MatchOptions = DEFAULT_OPTIONS,
  privateNames: readonly string[] = [],
): string[] {
  const excluded = excludedSpans(text, options);
  const names = matchNames(text, privateNames);
  const scored: { phrase: string; score: number }[] = [];
  for (const sentence of sentencesOf(text)) {
    if (inside(excluded, sentence) || sentence.words.length < 10) continue;
    const picked = sentence.words.slice(0, 12);
    const from = picked[0]?.from ?? sentence.from;
    const to = picked.at(-1)?.to ?? sentence.to;
    // Names match on the text as written, so "Anne-Marie" and "Dr. Okafor" across a sentence end count too.
    if (names.some((name) => name.from < to && name.to > from)) continue;
    const words = picked.map((w) => w.text);
    const score = words.reduce(
      (sum, w) => sum + (STOP_WORDS.has(w.toLowerCase()) ? 0 : Math.min(10, w.length)),
      0,
    );
    scored.push({ phrase: words.join(' '), score });
  }
  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((entry) => entry.phrase);
}
