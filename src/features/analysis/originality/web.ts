import { vloFetch } from '@/lib/net';
import type { Source } from './match';

/*
 * The web part of the originality check (free, no key). It runs only when the writer presses "Check the
 * web too". It sends a few short phrases of the text, never the whole text:
 *
 * - Wikipedia: an exact-phrase search for each phrase, then the plain text of each article it finds.
 * - OpenAlex: a search of research papers for each phrase, with the abstract of each paper it finds.
 *
 * The matcher then compares the text with each page on the device, as it does with any other source. The
 * network log records each request. Turnitin also checks student papers and paid journals, which no free
 * service offers, so this check can miss a source that Turnitin finds.
 */

export const WEB_PHRASES = 6;
const MAX_ARTICLES = 6;
const MAX_PAPERS = 9;

interface WikiSearch {
  query?: { search?: { title: string }[] };
}
interface WikiExtract {
  query?: { pages?: { title: string; extract?: string; missing?: boolean }[] };
}
interface OpenAlexWorks {
  results?: {
    id: string;
    display_name?: string;
    doi?: string | null;
    abstract_inverted_index?: Record<string, number[]> | null;
  }[];
}

async function json<T>(url: string, signal: AbortSignal | undefined): Promise<T> {
  const response = await vloFetch(url, {
    purpose: 'originality',
    headers: { Accept: 'application/json' },
    ...(signal ? { signal } : {}),
  });
  if (!response.ok) throw new Error(`HTTP ${String(response.status)}`);
  return (await response.json()) as T;
}

const WIKI = 'https://en.wikipedia.org/w/api.php';

function wikiUrl(params: Record<string, string>): string {
  const query = new URLSearchParams({ format: 'json', formatversion: '2', origin: '*', ...params });
  return `${WIKI}?${query.toString()}`;
}

/** The text of an OpenAlex abstract, which the API stores as word positions. */
export function abstractText(index: Readonly<Record<string, readonly number[]>>): string {
  const words: (string | undefined)[] = [];
  for (const [word, places] of Object.entries(index)) for (const at of places) words[at] = word;
  return words.filter((word): word is string => word !== undefined).join(' ');
}

export interface WebResult {
  sources: Source[];
  /** The services that failed, for the report. */
  failed: string[];
  requests: number;
}

/** Finds web pages that may hold the phrases, and returns their text as sources. */
export async function webSources(phrases: readonly string[], signal?: AbortSignal): Promise<WebResult> {
  const failed = new Set<string>();
  let requests = 0;
  const titles = new Set<string>();
  const papers = new Map<string, Source>();

  await Promise.all(
    phrases.slice(0, WEB_PHRASES).map(async (phrase) => {
      try {
        requests += 1;
        const found = await json<WikiSearch>(
          wikiUrl({
            action: 'query',
            list: 'search',
            srsearch: `"${phrase.replace(/"/g, '')}"`,
            srlimit: '2',
            srprop: '',
          }),
          signal,
        );
        for (const hit of found.query?.search ?? []) if (titles.size < MAX_ARTICLES) titles.add(hit.title);
      } catch (problem) {
        if (signal?.aborted) throw problem;
        failed.add('Wikipedia');
      }
      try {
        requests += 1;
        const query = new URLSearchParams({
          search: phrase,
          'per-page': '3',
          select: 'id,display_name,doi,abstract_inverted_index',
        });
        const found = await json<OpenAlexWorks>(`https://api.openalex.org/works?${query.toString()}`, signal);
        for (const work of found.results ?? []) {
          if (papers.size >= MAX_PAPERS || !work.abstract_inverted_index) continue;
          papers.set(work.id, {
            id: `openalex:${work.id}`,
            title: work.display_name ?? 'Untitled paper',
            origin: 'web',
            url: work.doi ?? work.id,
            text: abstractText(work.abstract_inverted_index),
          });
        }
      } catch (problem) {
        if (signal?.aborted) throw problem;
        failed.add('OpenAlex');
      }
    }),
  );

  const articles = await Promise.all(
    [...titles].map(async (title): Promise<Source | null> => {
      try {
        requests += 1;
        const found = await json<WikiExtract>(
          wikiUrl({
            action: 'query',
            prop: 'extracts',
            explaintext: '1',
            exsectionformat: 'plain',
            titles: title,
          }),
          signal,
        );
        const page = found.query?.pages?.[0];
        if (!page?.extract || page.missing) return null;
        return {
          id: `wikipedia:${page.title}`,
          title: `${page.title} (Wikipedia)`,
          origin: 'web',
          url: `https://en.wikipedia.org/wiki/${encodeURIComponent(page.title.replace(/ /g, '_'))}`,
          text: page.extract,
        };
      } catch (problem) {
        if (signal?.aborted) throw problem;
        failed.add('Wikipedia');
        return null;
      }
    }),
  );
  return {
    sources: [...articles.filter((s): s is Source => s !== null), ...papers.values()],
    failed: [...failed],
    requests,
  };
}
