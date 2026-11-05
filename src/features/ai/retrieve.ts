import MiniSearch from 'minisearch';
import { estimateTokens } from './engine/types';

/*
 * Ask the manuscript (plan decision P7). The manuscript splits into passages of whole paragraphs, about
 * 150 words each. MiniSearch finds the passages that fit the question best, and only the best 8 go in the
 * request, within a budget of 3,000 tokens.
 */

export const MAX_PASSAGES = 8;
export const PASSAGE_BUDGET = 3000;
const PASSAGE_WORDS = 150;

export interface Passage {
  id: string;
  itemId: string;
  title: string;
  text: string;
}

export interface Source {
  itemId: string;
  title: string;
  text: string;
}

const words = (text: string) => text.split(/\s+/).filter(Boolean).length;

/** Splits each text into passages of whole paragraphs. A paragraph longer than a passage stays whole. */
export function passagesOf(sources: readonly Source[]): Passage[] {
  const out: Passage[] = [];
  for (const source of sources) {
    const paragraphs = source.text
      .split(/\n\s*\n|\n/)
      .map((p) => p.trim())
      .filter(Boolean);
    let current: string[] = [];
    let count = 0;
    const flush = () => {
      if (current.length === 0) return;
      out.push({
        id: `${source.itemId}:${String(out.length)}`,
        itemId: source.itemId,
        title: source.title,
        text: current.join('\n\n'),
      });
      current = [];
      count = 0;
    };
    for (const paragraph of paragraphs) {
      const n = words(paragraph);
      if (count > 0 && count + n > PASSAGE_WORDS) flush();
      current.push(paragraph);
      count += n;
    }
    flush();
  }
  return out;
}

/** The passages that answer `query` best, best first, within the count and token budget. */
export function findPassages(
  passages: readonly Passage[],
  query: string,
  options: { max?: number; budget?: number; skipItem?: string; exact?: boolean } = {},
): Passage[] {
  const max = options.max ?? MAX_PASSAGES;
  const budget = options.budget ?? PASSAGE_BUDGET;
  const index = new MiniSearch<Passage>({
    fields: ['title', 'text'],
    searchOptions: { prefix: true, fuzzy: 0.2, boost: { title: 1.5 }, combineWith: 'OR' },
  });
  const pool = options.skipItem ? passages.filter((p) => p.itemId !== options.skipItem) : passages;
  index.addAll(pool);
  const byId = new Map(pool.map((p) => [p.id, p]));
  const picked: Passage[] = [];
  let used = 0;
  const hits = options.exact ? index.search(query, { prefix: false, fuzzy: false }) : index.search(query);
  for (const hit of hits) {
    if (picked.length >= max) break;
    const passage = byId.get(String(hit.id));
    if (!passage) continue;
    const cost = estimateTokens(passage.text);
    if (used + cost > budget) continue;
    picked.push(passage);
    used += cost;
  }
  return picked;
}

/** Words that start sentences, not names. */
const COMMON = new Set(
  'a an and as at but by for from he her his i if in it its my no not of on or our she so that the their then there these they this to was we when where who why with you your nobody somebody everyone'.split(
    ' ',
  ),
);

/** The names, places and years in a text, for the continuity check: words with a capital and 3- or 4-digit numbers. */
export function namesIn(text: string): string[] {
  const found = text.match(/[\p{Lu}][\p{L}'’-]+|\b\d{3,4}\b/gu) ?? [];
  return [...new Set(found.filter((w) => !COMMON.has(w.toLowerCase())))];
}

/** The passages as numbered text for a request. */
export function passagesText(passages: readonly Passage[]): string {
  return passages.map((p, i) => `[${String(i + 1)}] From "${p.title}":\n${p.text}`).join('\n\n');
}
