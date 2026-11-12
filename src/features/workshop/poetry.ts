/*
 * The poetry tools of the Workshop (Phase 17 decision D1). Each one works on plain poem text, where a line
 * feed ends a line and a blank line ends a stanza, and every space counts.
 *
 * - Erasure: the poet keeps some words of a source text, and the rest of the text goes. Each kept word
 *   stays at its place on its line, so the white space of the page becomes part of the poem.
 * - Golden shovel: each word of a line that the poet borrows ends one line of the new poem, in order.
 * - Echoes: the words that come back in more than one poem of the collection, its images and motifs.
 * - Line endings: where each line ends, on a pause or running on, and on a strong or a small word.
 */

/** One piece of a source line: a word that the poet can keep, or the space and marks between words. */
export interface ErasureToken {
  text: string;
  /** The index of the word in the whole source, or null for space and marks. */
  word: number | null;
}

/** A word keeps its letters, digits, apostrophes and inner hyphens. Everything else separates words. */
const WORD = /[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu;

/** The source as lines of tokens. Line feeds stay, so the erasure keeps the source's lines. */
export function erasureTokens(source: string): ErasureToken[][] {
  let count = 0;
  return source
    .replace(/\r\n?/g, '\n')
    .replace(/\u00a0/g, ' ')
    .split('\n')
    .map((line) => {
      const tokens: ErasureToken[] = [];
      let last = 0;
      for (const match of line.matchAll(WORD)) {
        if (match.index > last) tokens.push({ text: line.slice(last, match.index), word: null });
        tokens.push({ text: match[0], word: count });
        count += 1;
        last = match.index + match[0].length;
      }
      if (last < line.length) tokens.push({ text: line.slice(last), word: null });
      return tokens;
    });
}

/**
 * The erasure poem: each kept word at its place on its line, with spaces in place of the rest. A line with
 * no kept word goes. One blank line stays between the groups of lines, so the poem keeps the source's
 * breaks as stanzas. `marks` keeps the punctuation right after a kept word.
 */
export function erasurePoem(
  lines: readonly ErasureToken[][],
  kept: ReadonlySet<number>,
  marks = false,
): string {
  const out: string[] = [];
  let gap = false;
  for (const tokens of lines) {
    let line = '';
    let lastKept = false;
    for (const token of tokens) {
      const keep: boolean =
        token.word !== null ? kept.has(token.word) : marks && lastKept && /^[^\s]/.test(token.text);
      if (token.word === null && keep) {
        // Only the marks right after the word stay, not the space after them.
        const stuck = /^\S+/.exec(token.text)?.[0] ?? '';
        line += stuck + ' '.repeat(token.text.length - stuck.length);
      } else line += keep ? token.text : ' '.repeat(Array.from(token.text).length);
      if (token.word !== null) lastKept = keep;
    }
    line = line.trimEnd();
    if (line === '') {
      gap = out.length > 0;
      continue;
    }
    if (gap) out.push('');
    gap = false;
    out.push(line);
  }
  return out.length === 0 ? '' : `${out.join('\n')}\n`;
}

/** The words of a borrowed line, in order, without their punctuation. */
export function shovelWords(line: string): string[] {
  return [...line.replace(/\u00a0/g, ' ').matchAll(WORD)].map((m) => m[0]);
}

/**
 * A golden shovel to write into: an epigraph stanza with the borrowed line and its poet, then one line for
 * each word, which ends with that word. `perStanza` groups the lines, or 0 keeps them in one stanza.
 */
export function goldenShovel(line: string, poet: string, perStanza: number): string {
  const words = shovelWords(line);
  if (words.length === 0) return '';
  const epigraph = [line.trim(), ...(poet.trim() === '' ? [] : [`after ${poet.trim()}`])];
  const stanzas: string[][] = [];
  const size = perStanza > 0 ? perStanza : words.length;
  for (let i = 0; i < words.length; i += size) stanzas.push(words.slice(i, i + size));
  return `${[epigraph, ...stanzas].map((s) => s.join('\n')).join('\n\n')}\n`;
}

/**
 * Common English words that carry no image, left out of Echoes. A word of three letters or fewer is left
 * out too.
 */
const STOP = new Set(
  `about above after again against all also among and another any are aren't around because been before
being below between both but came can can't cannot come could couldn't did didn't does doesn't doing don't
down during each even ever every few for from further get gets got had hadn't has hasn't have haven't
having he'd he'll he's her here here's hers herself him himself his how how's i'd i'll i'm i've into isn't
it's its itself just let's like made make many might more most much must mustn't myself never nor not now
off once one only other ought our ours ourselves out over own same say said says shall shan't she'd she'll
she's should shouldn't some still such than that that's the their theirs them themselves then there
there's these they they'd they'll they're they've this those though through thus too under until upon very
was wasn't we'd we'll we're we've were weren't what what's when when's where where's which while who who's
whom why why's will with within without won't would wouldn't yet you'd you'll you're you've your yours
yourself yourselves back away again know knew think thought went going goes take took tell told well`.split(
    /\s+/,
  ),
);

/** A light English stem, so "tides" and "tide" meet. It only drops a plural or possessive end. */
export function stem(word: string): string {
  const lower = word.toLowerCase().replace(/’/g, "'");
  const base = lower.replace(/'s$/, '');
  if (base.length > 4 && base.endsWith('ies')) return `${base.slice(0, -3)}y`;
  if (base.length > 3 && base.endsWith('s') && !/(ss|us|is)$/.test(base)) return base.slice(0, -1);
  return base;
}

export interface Echo {
  /** The word as the poet wrote it most often. */
  word: string;
  /** The poems that hold it, in collection order. */
  poems: { id: string; title: string; count: number }[];
  total: number;
}

/** The words that come back in two poems or more, most poems first. */
export function echoes(poems: readonly { id: string; title: string; text: string }[]): Echo[] {
  const byStem = new Map<string, { forms: Map<string, number>; poems: Map<string, number> }>();
  for (const poem of poems) {
    for (const match of poem.text.matchAll(WORD)) {
      const word = match[0];
      const lower = word.toLowerCase().replace(/’/g, "'");
      if (lower.length <= 3 || STOP.has(lower) || /^\d+$/.test(lower)) continue;
      const key = stem(word);
      const entry = byStem.get(key) ?? { forms: new Map<string, number>(), poems: new Map<string, number>() };
      entry.forms.set(lower, (entry.forms.get(lower) ?? 0) + 1);
      entry.poems.set(poem.id, (entry.poems.get(poem.id) ?? 0) + 1);
      byStem.set(key, entry);
    }
  }
  const order = new Map(poems.map((p, i) => [p.id, i]));
  const titles = new Map(poems.map((p) => [p.id, p.title]));
  const out: Echo[] = [];
  for (const entry of byStem.values()) {
    if (entry.poems.size < 2) continue;
    const word = [...entry.forms].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] ?? '';
    const list = [...entry.poems]
      .map(([id, count]) => ({ id, title: titles.get(id) ?? '', count }))
      .sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
    out.push({ word, poems: list, total: list.reduce((n, p) => n + p.count, 0) });
  }
  return out.sort(
    (a, b) => b.poems.length - a.poems.length || b.total - a.total || a.word.localeCompare(b.word),
  );
}

/** Small words that a line rarely needs to end on: articles, prepositions, conjunctions and pronouns. */
const SMALL = new Set(
  `a an the of to in on at by for with from into onto upon and but or nor so as than that which who whom
whose if is was are were be been am my your his her its our their this these those i`.split(/\s+/),
);

export interface LineEnding {
  /** The line number in the poem, from 1. */
  number: number;
  text: string;
  /** The last word, or '' for a line with no word. */
  last: string;
  /** The line ends on a mark that makes a pause: . , ; : ! ? or a dash. */
  pause: boolean;
  /** The line ends on a small word, such as "the" or "of". */
  small: boolean;
}

export function lineEndings(poem: string): LineEnding[] {
  const out: LineEnding[] = [];
  let number = 0;
  for (const raw of poem.replace(/\u00a0/g, ' ').split('\n')) {
    const text = raw.trimEnd();
    if (text.trim() === '') continue;
    number += 1;
    const words = [...text.matchAll(WORD)].map((m) => m[0]);
    const last = words.at(-1) ?? '';
    const pause = /[.,;:!?—–-]["'”’)\]]*$/.test(text);
    out.push({ number, text, last, pause, small: SMALL.has(last.toLowerCase()) });
  }
  return out;
}
