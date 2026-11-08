import { Editor } from '@tiptap/core';
import * as Y from 'yjs';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { aiOriginWords, mappedText } from '@/features/analysis/editorText';
import {
  checkOriginality,
  DEFAULT_OPTIONS,
  excludedSpans,
  searchPhrases,
  stem,
  type Source,
} from '@/features/analysis/originality/match';
import { cleanPasted } from '@/features/analysis/originality/sources';
import { safeLink } from '@/features/analysis/panel/OriginalityTab';
import { poemExtensions } from '@/features/editor/extensions/poem';
import { proseExtensions } from '@/features/editor/extensions/prose';

vi.mock('@/lib/net', () => ({ vloFetch: vi.fn() }));

const SOURCE: Source = {
  id: 's1',
  title: 'The source',
  origin: 'pasted',
  text:
    'The migration of monarch butterflies covers thousands of miles across North America every autumn. ' +
    'Scientists believe the insects navigate using the position of the sun and an internal clock in their antennae. ' +
    'Each spring a new generation returns north to lay eggs on milkweed plants.',
};

describe('originality matching', () => {
  test('stems join word forms', () => {
    expect(stem('walked')).toBe(stem('walking'));
    expect(stem('butterflies')).toBe(stem('butterfly'));
    expect(stem('Insects')).toBe('insect');
  });

  test('a copied run matches even with changed case and punctuation', () => {
    const text =
      'My essay starts here. Scientists believe the insects navigate, using the position of the Sun and an internal clock in their antennae! Then I write my own ending.';
    const report = checkOriginality(text, [SOURCE]);
    const copied = report.matches.filter((m) => m.kind === 'copied');
    expect(copied).toHaveLength(1);
    expect(text.slice(copied[0]?.from, copied[0]?.to)).toMatch(/^Scientists believe.*antennae$/);
    expect(copied[0]?.words).toBe(18);
    expect(report.sources[0]?.source.id).toBe('s1');
    expect(report.similarity).toBeGreaterThan(0.5);
  });

  test('a close paraphrase matches with no copied run', () => {
    const text = 'Every spring, milkweed plants receive eggs from a new generation that returns north.';
    const report = checkOriginality(text, [SOURCE]);
    expect(report.matches.map((m) => m.kind)).toEqual(['paraphrase']);
  });

  test('original text has no matches', () => {
    const report = checkOriginality(
      'My grandmother kept bees behind the barn and never wore gloves near them.',
      [SOURCE],
    );
    expect(report.matches).toEqual([]);
    expect(report.similarity).toBe(0);
  });

  test('the filters leave out quotes, references and short matches', () => {
    const quoted = `She wrote that "scientists believe the insects navigate using the position of the sun" in her notes.`;
    expect(checkOriginality(quoted, [SOURCE]).matches).toEqual([]);
    expect(
      checkOriginality(quoted, [SOURCE], { ...DEFAULT_OPTIONS, excludeQuotes: false }).matches,
    ).toHaveLength(1);
    const refs =
      'My own words are here.\n\nReferences\n\nThe migration of monarch butterflies covers thousands of miles across North America.';
    expect(excludedSpans(refs, DEFAULT_OPTIONS)).toHaveLength(1);
    expect(checkOriginality(refs, [SOURCE]).matches).toEqual([]);
    const short = 'A note: the position of the sun and an internal clock.';
    expect(
      checkOriginality(short, [SOURCE], { ...DEFAULT_OPTIONS, minWords: 12 }).matches.filter(
        (m) => m.kind === 'copied',
      ),
    ).toEqual([]);
  });

  test('search phrases skip quoted text and short sentences', () => {
    const text =
      'Short one. "A quoted sentence that is long enough to search for here and now."\n\nThe migration of monarch butterflies covers thousands of miles across North America every autumn.';
    const phrases = searchPhrases(text, 6);
    expect(phrases).toEqual([
      'The migration of monarch butterflies covers thousands of miles across North America',
    ]);
  });

  test('pasted sources and links are cleaned', () => {
    expect(cleanPasted([{ id: 'a', title: 'T', text: 'x' }, { id: 1 }, null])).toEqual([
      { id: 'a', title: 'T', text: 'x' },
    ]);
    expect(safeLink('javascript:alert(1)')).toBeNull();
    expect(safeLink('https://example.org/a')).toBe('https://example.org/a');
    expect(safeLink(undefined)).toBeNull();
  });
});

describe('web sources', () => {
  test('reads Wikipedia and OpenAlex answers into sources', async () => {
    const { vloFetch } = await import('@/lib/net');
    const answer = (body: unknown) => Promise.resolve(new Response(JSON.stringify(body), { status: 200 }));
    vi.mocked(vloFetch).mockImplementation((url: string) => {
      if (url.includes('list=search')) return answer({ query: { search: [{ title: 'Monarch butterfly' }] } });
      if (url.includes('prop=extracts'))
        return answer({ query: { pages: [{ title: 'Monarch butterfly', extract: SOURCE.text }] } });
      return answer({
        results: [
          {
            id: 'https://openalex.org/W1',
            display_name: 'A paper',
            doi: null,
            abstract_inverted_index: { Monarchs: [0], fly: [1] },
          },
        ],
      });
    });
    const { webSources, abstractText } = await import('@/features/analysis/originality/web');
    expect(abstractText({ b: [1], a: [0, 2] })).toBe('a b a');
    const found = await webSources(['monarch butterflies covers thousands of miles']);
    expect(found.failed).toEqual([]);
    expect(found.sources.map((s) => s.title)).toEqual(['Monarch butterfly (Wikipedia)', 'A paper']);
    expect(found.sources[0]?.url).toBe('https://en.wikipedia.org/wiki/Monarch_butterfly');
    for (const call of vi.mocked(vloFetch).mock.calls) expect(call[1].purpose).toBe('originality');
  });

  test('a failing service is named, and the rest still works', async () => {
    const { vloFetch } = await import('@/lib/net');
    vi.mocked(vloFetch).mockImplementation((url: string) =>
      url.includes('wikipedia')
        ? Promise.reject(new TypeError('offline'))
        : Promise.resolve(new Response('{"results":[]}')),
    );
    const { webSources } = await import('@/features/analysis/originality/web');
    const found = await webSources(['one phrase of the text here']);
    expect(found.failed).toEqual(['Wikipedia']);
    expect(found.sources).toEqual([]);
  });
});

describe('the analysed text of an editor', () => {
  const editors: Editor[] = [];
  afterEach(() => {
    for (const e of editors.splice(0)) e.destroy();
  });
  const mount = (kind: 'prose' | 'poem', html: string) => {
    const doc = new Y.Doc();
    const editor = new Editor({
      extensions: kind === 'poem' ? poemExtensions(doc, { tabSpaces: 4 }) : proseExtensions(doc),
    });
    editors.push(editor);
    editor.commands.setContent(html);
    return editor;
  };

  test('prose paragraphs are apart by a blank line, and places map back to the document', () => {
    const editor = mount('prose', '<p>First <em>one</em>.</p><p>Second.</p>');
    const mapped = mappedText(editor.state.doc);
    expect(mapped.text).toBe('First one.\n\nSecond.');
    const from = mapped.text.indexOf('Second');
    expect(editor.state.doc.textBetween(mapped.at(from), mapped.at(from + 6))).toBe('Second');
    expect(editor.state.doc.textBetween(mapped.at(6), mapped.at(9))).toBe('one');
  });

  test('poem lines of a stanza are apart by a line break', () => {
    const editor = mount('poem', '<div data-type="stanza"><p>Line one</p><p>Line two</p></div>');
    expect(mappedText(editor.state.doc).text).toMatch(/Line one\nLine two/);
  });

  test('counts words without the co-writer mark', () => {
    const editor = mount('prose', '<p>Four plain words here.</p>');
    expect(aiOriginWords(editor.state.doc)).toEqual({ ai: 0, total: 4 });
  });
});
