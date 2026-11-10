import { useLiveQuery } from 'dexie-react-hooks';
import { clock } from '@/lib/clock';
import { db, type Source, type SourceName, type SourceType } from '@/lib/db';
import { newId } from '@/lib/ids';

/*
 * The sources of a project (roadmap 2 F64, plan Task M5). A writer types a source in, or imports a BibTeX
 * or CSL-JSON file from Zotero or another reference manager. Each source has a key that is unique in the
 * project. A citation in the text names that key.
 */

/** The letters of a key: BibTeX's own, with no space, comma or brace. */
export const SOURCE_KEY = /^[\p{L}\p{N}_:.-]{1,64}$/u;
/** The most characters in one field of a source. */
export const MAX_SOURCE_TEXT = 1000;

/** A source before it has its project and id. With no key, Vlo makes one from the author and the year. */
export type SourceDraft = Omit<Source, 'id' | 'projectId' | 'key'> & { key?: string };

const TEXT_FIELDS = ['container', 'publisher', 'year', 'volume', 'issue', 'pages', 'doi', 'url'] as const;

const clip = (value: string) => value.trim().slice(0, MAX_SOURCE_TEXT);

/** A draft as a reader finds it: each optional field may be absent. */
type RawDraft = Pick<SourceDraft, 'type' | 'authors' | 'title'> &
  Partial<Record<(typeof TEXT_FIELDS)[number] | 'key', string | undefined>> & {
    editors?: SourceName[] | undefined;
  };

/** A draft with each field trimmed, and no empty optional field. */
function cleanDraft(draft: RawDraft): SourceDraft {
  const out: SourceDraft = {
    type: draft.type,
    authors: draft.authors.filter((name) => name.family.trim() !== ''),
    title: clip(draft.title),
  };
  if (draft.key !== undefined) out.key = draft.key;
  const editors = draft.editors?.filter((name) => name.family.trim() !== '') ?? [];
  if (editors.length > 0) out.editors = editors;
  for (const field of TEXT_FIELDS) {
    const value = clip(draft[field] ?? '');
    if (value !== '') out[field] = value;
  }
  if (out.pages) out.pages = out.pages.replace(/\s*-{1,2}\s*/g, '–');
  if (out.doi) out.doi = out.doi.replace(/^(?:https?:\/\/(?:dx\.)?doi\.org\/|doi:\s*)/i, '');
  return out;
}

/** A key from the first author's family name and the year, such as "marlow2019". */
export function draftKey(draft: SourceDraft): string {
  const name = (draft.authors[0]?.family ?? draft.title.split(/\s+/)[0] ?? '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, '');
  const base = `${name}${draft.year?.match(/\d{4}/)?.[0] ?? ''}`.slice(0, 56);
  return base === '' ? 'source' : base;
}

/** The key, or the key with "-2", "-3" and so on when another source has it. */
export function uniqueKey(key: string, taken: ReadonlySet<string>): string {
  if (!taken.has(key)) return key;
  for (let n = 2; ; n += 1) {
    const next = `${key.slice(0, 60)}-${String(n)}`;
    if (!taken.has(next)) return next;
  }
}

/* ------------------------------------------------------------------ Names */

/** A name as "Family, Given" or "Given Family". A name in braces is one family name, such as a group. */
function readName(raw: string): SourceName | null {
  const name = raw.trim();
  if (name === '') return null;
  if (/^\{.*\}$/.test(name) && depthZero(name.slice(1, -1))) return { family: plain(name.slice(1, -1)) };
  const parts = splitTop(name, ',').map((part) => plain(part).trim());
  if (parts.length > 1) {
    // "Family, Jr, Given" puts the given name last.
    const given = parts[parts.length - 1] ?? '';
    return given === '' ? { family: parts[0] ?? '' } : { family: parts[0] ?? '', given };
  }
  const words = splitTop(name, ' ').filter(Boolean);
  const family = plain(words.pop() ?? '');
  const given = words.map(plain).join(' ');
  return given === '' ? { family } : { family, given };
}

/** The names of a text with one name on each line, for the source form. */
export function namesFromText(text: string): SourceName[] {
  return text
    .split('\n')
    .map(readName)
    .filter((name): name is SourceName => name !== null);
}

export function namesToText(names: readonly SourceName[] | undefined): string {
  return (names ?? []).map((n) => (n.given ? `${n.family}, ${n.given}` : n.family)).join('\n');
}

/* ------------------------------------------------------------------ BibTeX */

const ACCENTS: Readonly<Record<string, string>> = {
  "'": '́',
  '`': '̀',
  '^': '̂',
  '"': '̈',
  '~': '̃',
  '=': '̄',
  '.': '̇',
  u: '̆',
  v: '̌',
  H: '̋',
  c: '̧',
  k: '̨',
};

const LETTERS: Readonly<Record<string, string>> = {
  ss: 'ß',
  o: 'ø',
  O: 'Ø',
  ae: 'æ',
  AE: 'Æ',
  oe: 'œ',
  OE: 'Œ',
  aa: 'å',
  AA: 'Å',
  l: 'ł',
  L: 'Ł',
  i: 'ı',
};

/** True when the braces of a text close at its end and never below zero. */
function depthZero(text: string): boolean {
  let depth = 0;
  for (const char of text) {
    depth += char === '{' ? 1 : char === '}' ? -1 : 0;
    if (depth < 0) return false;
  }
  return depth === 0;
}

/** Splits a text at each separator outside braces. */
function splitTop(text: string, separator: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (char === '{') depth += 1;
    else if (char === '}') depth -= 1;
    else if (depth === 0 && text.startsWith(separator, i)) {
      parts.push(text.slice(start, i));
      start = i + separator.length;
      i += separator.length - 1;
    }
  }
  parts.push(text.slice(start));
  return parts;
}

/** Text from LaTeX: accents as letters, and no braces or commands. */
function plain(latex: string): string {
  const accent = (_: string, mark: string, letter: string) =>
    `${letter}${ACCENTS[mark] ?? ''}`.normalize('NFC');
  return (
    latex
      // \'e, \'{e} and \'{\i}. A letter accent such as \v needs a brace or a space, so \url stays a command.
      .replace(/\\(['`^"~=.])\s*\{?\\?([a-zA-Z])\}?/g, accent)
      .replace(/\\([uvHck])(?:\s+|\{\\?)([a-zA-Z])\}?/g, accent)
      .replace(/\\([a-zA-Z]{1,2})\{\}|\{\\([a-zA-Z]{1,2})\}/g, (all, a?: string, b?: string) => {
        return LETTERS[a ?? b ?? ''] ?? all;
      })
      .replace(/\\([&%$#_{}])/g, '$1')
      .replace(/\\textendash\b\s*|--/g, '–')
      .replace(/\\[a-zA-Z]+\s*/g, '')
      .replace(/[{}]/g, '')
      .replace(/[\s~]+/g, ' ')
      .trim()
  );
}

/** The fields of one entry's body, with each name in lower case. Month names and numbers stay as words. */
function readFields(body: string): Map<string, string> {
  const fields = new Map<string, string>();
  let i = 0;
  const skipSpace = () => {
    while (i < body.length && /[\s,]/.test(body[i] ?? '')) i += 1;
  };
  for (;;) {
    skipSpace();
    const name = /^[\w-]+/.exec(body.slice(i))?.[0];
    if (!name) break;
    i += name.length;
    while (/\s/.test(body[i] ?? '')) i += 1;
    if (body[i] !== '=') break;
    i += 1;
    let value = '';
    for (;;) {
      while (/\s/.test(body[i] ?? '')) i += 1;
      const open = body[i];
      if (open === '{' || open === '"') {
        const close = open === '{' ? '}' : '"';
        let depth = 0;
        let j = i + 1;
        for (; j < body.length; j += 1) {
          const char = body[j];
          if (char === '\\') j += 1;
          else if (char === '{') depth += 1;
          else if (char === close && depth === 0) break;
          else if (char === '}') depth -= 1;
        }
        value += body.slice(i + 1, j);
        i = j + 1;
      } else {
        const word = /^[\w-]+/.exec(body.slice(i))?.[0] ?? '';
        value += word;
        i += word.length;
      }
      while (/\s/.test(body[i] ?? '')) i += 1;
      if (body[i] !== '#') break;
      i += 1;
    }
    fields.set(name.toLowerCase(), value);
  }
  return fields;
}

const BIB_TYPES: Readonly<Record<string, SourceType>> = {
  article: 'article',
  incollection: 'chapter',
  inbook: 'chapter',
  inproceedings: 'chapter',
  conference: 'chapter',
  bookinbook: 'chapter',
  inreference: 'chapter',
  online: 'web',
  electronic: 'web',
  webpage: 'web',
  www: 'web',
};

/** The sources of a BibTeX or BibLaTeX file. An entry with no title stays out. */
export function parseBibtex(source: string): SourceDraft[] {
  const drafts: SourceDraft[] = [];
  const entry = /@(\w+)\s*([{(])\s*/g;
  for (let match = entry.exec(source); match !== null; match = entry.exec(source)) {
    const kind = (match[1] ?? '').toLowerCase();
    const close = match[2] === '(' ? ')' : '}';
    let depth = 0;
    let end = entry.lastIndex;
    for (; end < source.length; end += 1) {
      const char = source[end];
      if (char === '{') depth += 1;
      else if (char === '}' && depth > 0) depth -= 1;
      else if (char === close && depth === 0) break;
    }
    const body = source.slice(entry.lastIndex, end);
    entry.lastIndex = end + 1;
    if (kind === 'comment' || kind === 'string' || kind === 'preamble') continue;
    const comma = body.indexOf(',');
    const key = (comma < 0 ? body : body.slice(0, comma)).trim();
    const fields = readFields(comma < 0 ? '' : body.slice(comma + 1));
    const field = (...names: string[]) => {
      for (const name of names) {
        const value = fields.get(name);
        if (value !== undefined && value.trim() !== '') return plain(value);
      }
      return undefined;
    };
    const title = field('title');
    if (title === undefined) continue;
    // A URL keeps its own characters, such as "~" and "%".
    const url = fields.get('url')?.replace(/[{}]/g, '');
    const type = BIB_TYPES[kind] ?? (kind === 'misc' && url !== undefined ? 'web' : 'book');
    const people = (name: string) =>
      splitTop(fields.get(name) ?? '', ' and ')
        .map(readName)
        .filter((n): n is SourceName => n !== null);
    const howPublished = field('howpublished');
    drafts.push(
      cleanDraft({
        ...(SOURCE_KEY.test(key) ? { key } : {}),
        type,
        authors: people('author'),
        editors: people('editor'),
        title,
        container:
          type === 'article'
            ? field('journaltitle', 'journal')
            : type === 'chapter'
              ? field('booktitle', 'maintitle')
              : type === 'web'
                ? (field('organization', 'titleaddon', 'journal') ??
                  (howPublished && !/^\\?url/i.test(howPublished) ? howPublished : undefined))
                : undefined,
        publisher: field('publisher', 'institution', 'school', 'organization'),
        year: field('year') ?? field('date')?.match(/\d{4}/)?.[0],
        volume: field('volume'),
        issue: field('number', 'issue'),
        pages: field('pages'),
        doi: fields.get('doi')?.replace(/[{}]/g, ''),
        url,
      }),
    );
  }
  return drafts;
}

/* ------------------------------------------------------------------ CSL-JSON */

const CSL_TYPES: Readonly<Record<string, SourceType>> = {
  chapter: 'chapter',
  'paper-conference': 'chapter',
  'entry-encyclopedia': 'chapter',
  'entry-dictionary': 'chapter',
  entry: 'chapter',
  'article-journal': 'article',
  'article-magazine': 'article',
  'article-newspaper': 'article',
  article: 'article',
  review: 'article',
  webpage: 'web',
  'post-weblog': 'web',
  post: 'web',
};

type Csl = Record<string, unknown>;

const cslText = (value: unknown) =>
  typeof value === 'string' ? value : typeof value === 'number' ? String(value) : undefined;

function cslNames(value: unknown): SourceName[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((raw: unknown): SourceName[] => {
    if (typeof raw !== 'object' || raw === null) return [];
    const name = raw as Csl;
    const family = cslText(name.family) ?? cslText(name.literal);
    if (family === undefined) return [];
    const particle = [cslText(name['non-dropping-particle']), family].filter(Boolean).join(' ');
    const given = cslText(name.given);
    return [given ? { family: particle, given } : { family: particle }];
  });
}

function cslYear(value: unknown): string | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const date = value as Csl;
  const parts = date['date-parts'];
  if (Array.isArray(parts) && Array.isArray(parts[0])) return cslText((parts[0] as unknown[])[0]);
  return (cslText(date.raw) ?? cslText(date.literal))?.match(/\d{4}/)?.[0];
}

/** The sources of a CSL-JSON file: a list of items, as Zotero exports it. An item with no title stays out. */
export function parseCslJson(source: string): SourceDraft[] {
  const value: unknown = JSON.parse(source);
  const items: unknown[] = Array.isArray(value) ? value : [value];
  return items.flatMap((raw): SourceDraft[] => {
    if (typeof raw !== 'object' || raw === null) return [];
    const item = raw as Csl;
    const title = cslText(item.title);
    if (title === undefined || title.trim() === '') return [];
    const key = cslText(item['citation-key']) ?? cslText(item.id);
    return [
      cleanDraft({
        ...(key !== undefined && SOURCE_KEY.test(key) ? { key } : {}),
        type: CSL_TYPES[cslText(item.type) ?? ''] ?? 'book',
        authors: cslNames(item.author),
        editors: cslNames(item.editor),
        title,
        container: cslText(item['container-title']),
        publisher: cslText(item.publisher),
        year: cslYear(item.issued),
        volume: cslText(item.volume),
        issue: cslText(item.issue),
        pages: cslText(item.page),
        doi: cslText(item.DOI),
        url: cslText(item.URL),
      }),
    ];
  });
}

/** The sources of a file, by its name: ".bib" is BibTeX, ".json" is CSL-JSON. */
export function readSourceFile(name: string, text: string): SourceDraft[] {
  let drafts: SourceDraft[];
  try {
    drafts = /\.json$/i.test(name) ? parseCslJson(text) : parseBibtex(text);
  } catch {
    throw new RangeError('Vlo could not read this file. Export it again as BibTeX or CSL JSON.');
  }
  if (drafts.length === 0) throw new RangeError('This file has no source with a title.');
  return drafts;
}

/* ------------------------------------------------------------------ Storage */

/** The sources of a project, by the first author and then the year. */
export async function sourcesFor(projectId: string): Promise<Source[]> {
  const rows = await db.sources.where('projectId').equals(projectId).toArray();
  return rows.sort((a, b) => sortName(a).localeCompare(sortName(b)));
}

const sortName = (s: Source) => `${s.authors[0]?.family ?? s.title} ${s.year ?? ''} ${s.key}`;

/** The sources of a project, live. Undefined while they load. */
export function useSources(projectId: string): Source[] | undefined {
  return useLiveQuery(() => sourcesFor(projectId), [projectId]);
}

async function touch(projectId: string): Promise<void> {
  await db.projects.update(projectId, { updatedAt: clock.now() });
}

function checkDraft(draft: SourceDraft): SourceDraft {
  const clean = cleanDraft(draft);
  if (clean.title === '') throw new RangeError('Type a title.');
  if (clean.key !== undefined && !SOURCE_KEY.test(clean.key))
    throw new RangeError('A key has letters, numbers and _ : . - only, with no space.');
  return clean;
}

/** Adds sources to a project. A key that the project has, or that the list has twice, gets a suffix. */
export async function addSources(projectId: string, drafts: readonly SourceDraft[]): Promise<Source[]> {
  const clean = drafts.map(checkDraft);
  return db.transaction('rw', db.sources, db.projects, async () => {
    const taken = new Set(
      (await db.sources.where('projectId').equals(projectId).toArray()).map((s) => s.key),
    );
    const added = clean.map(({ key, ...fields }): Source => {
      const unique = uniqueKey(key ?? draftKey(fields), taken);
      taken.add(unique);
      return { ...fields, id: newId(), projectId, key: unique };
    });
    await db.sources.bulkAdd(added);
    await touch(projectId);
    return added;
  });
}

/** Changes a source. Its key stays, so each citation of it stays. */
export async function updateSource(id: string, draft: SourceDraft): Promise<void> {
  const fields = checkDraft(draft);
  await db.transaction('rw', db.sources, db.projects, async () => {
    const source = await db.sources.get(id);
    if (!source) return;
    await db.sources.put({ ...fields, id, projectId: source.projectId, key: source.key });
    await touch(source.projectId);
  });
}

/** Deletes a source and returns it, for Undo. Its citations show "[missing source]". */
export async function deleteSource(id: string): Promise<Source | undefined> {
  return db.transaction('rw', db.sources, db.projects, async () => {
    const source = await db.sources.get(id);
    if (!source) return undefined;
    await db.sources.delete(id);
    await touch(source.projectId);
    return source;
  });
}

export async function restoreSource(source: Source): Promise<void> {
  await db.transaction('rw', db.sources, db.projects, async () => {
    await db.sources.put(source);
    await touch(source.projectId);
  });
}
