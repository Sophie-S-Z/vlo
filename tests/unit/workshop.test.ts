import { describe, expect, test } from 'vitest';
import { countCitations } from '@/features/workshop/citations';
import {
  echoes,
  erasurePoem,
  erasureTokens,
  goldenShovel,
  lineEndings,
  shovelWords,
  stem,
} from '@/features/workshop/poetry';
import { checkHeadline, firstSentence, spine } from '@/features/workshop/prose';

/* Phase 17 Q-D: the Workshop tools for poems, essays, articles and research papers. */

describe('erasure', () => {
  const source =
    'The tide came in, slow as a held breath,\nand the boats lay down on their sides.\n\nNo one woke.';
  const lines = erasureTokens(source);
  const index = (word: string, nth = 0) => lines.flat().filter((t) => t.text === word)[nth]?.word ?? -1;

  test('each word gets one index, in reading order, and space stays apart', () => {
    expect(lines).toHaveLength(4);
    expect(lines[0]?.map((t) => t.text)).toEqual([
      'The',
      ' ',
      'tide',
      ' ',
      'came',
      ' ',
      'in',
      ', ',
      'slow',
      ' ',
      'as',
      ' ',
      'a',
      ' ',
      'held',
      ' ',
      'breath',
      ',',
    ]);
    expect(index('tide')).toBe(1);
    expect(index('No')).toBe(17);
  });

  test('a kept word stays at its place, and a line with no kept word goes', () => {
    const kept = new Set([index('tide'), index('held'), index('breath'), index('woke')]);
    expect(erasurePoem(lines, kept)).toBe(
      `${' '.repeat(4)}tide${' '.repeat(20)}held breath

${' '.repeat(7)}woke
`,
    );
  });

  test('with marks on, the punctuation right after a kept word stays', () => {
    const kept = new Set([index('in'), index('slow'), index('breath')]);
    expect(erasurePoem(lines, kept, true)).toBe(
      `${' '.repeat(14)}in, slow${' '.repeat(11)}breath,
`,
    );
  });

  test('no kept word gives no poem', () => {
    expect(erasurePoem(lines, new Set())).toBe('');
  });
});

describe('golden shovel', () => {
  test('each word of the line ends one line, under an epigraph with the poet', () => {
    expect(shovelWords('We real cool. We')).toEqual(['We', 'real', 'cool', 'We']);
    expect(goldenShovel('We real cool. We', 'Gwendolyn Brooks', 2)).toBe(
      'We real cool. We\nafter Gwendolyn Brooks\n\nWe\nreal\n\ncool\nWe\n',
    );
    expect(goldenShovel('salt hours', '', 0)).toBe('salt hours\n\nsalt\nhours\n');
    expect(goldenShovel('  ...  ', 'x', 2)).toBe('');
  });
});

describe('echoes', () => {
  test('a word in two poems or more comes back, with its poems in collection order', () => {
    const list = echoes([
      { id: 'a', title: 'Harbour', text: 'The tides turned.\nSalt on the sill, salt in the bread.' },
      { id: 'b', title: 'Ferry', text: 'A tide of salt\nand the gulls' },
      { id: 'c', title: 'Night', text: 'No salt here. The gulls sleep, and the tide.' },
    ]);
    expect(list.map((e) => e.word)).toEqual(['salt', 'tide', 'gulls']);
    expect(list[0]?.poems).toEqual([
      { id: 'a', title: 'Harbour', count: 2 },
      { id: 'b', title: 'Ferry', count: 1 },
      { id: 'c', title: 'Night', count: 1 },
    ]);
    expect(list[1]?.poems.map((p) => p.id)).toEqual(['a', 'b', 'c']);
  });

  test('the stem joins plurals and possessives, and leaves words such as "grass" whole', () => {
    expect(stem('Tides')).toBe('tide');
    expect(stem('cherries')).toBe('cherry');
    expect(stem('grass')).toBe('grass');
    expect(stem('mother’s')).toBe('mother');
  });
});

describe('line endings', () => {
  test('each line ends on a pause or runs on, and a small last word shows', () => {
    const list = lineEndings(
      'The boats lay down on\ntheir sides, and slept.\n\n  No one woke —\nthe harbour and the\n',
    );
    expect(list.map((l) => [l.number, l.last, l.pause, l.small])).toEqual([
      [1, 'on', false, true],
      [2, 'slept', true, false],
      [3, 'woke', true, false],
      [4, 'the', false, true],
    ]);
  });
});

describe('the prose tools', () => {
  test('the spine holds the first sentence of each paragraph, and skips headings', () => {
    const sections = spine([
      {
        id: 's1',
        title: 'Introduction',
        text: 'Ferries shaped the coast. They carried mail.\n\nWhy it matters\n\nWithout them, the islands emptied out over two generations of families. The rest followed.',
      },
      { id: 's2', title: 'Conclusion', text: '' },
    ]);
    expect(sections).toEqual([
      {
        id: 's1',
        title: 'Introduction',
        points: [
          'Ferries shaped the coast.',
          'Without them, the islands emptied out over two generations of families.',
        ],
      },
      { id: 's2', title: 'Conclusion', points: [] },
    ]);
    expect(firstSentence('  One.  Two. ')).toBe('One.');
  });

  test('a headline shows its length, and a note when search results may cut it', () => {
    expect(checkHeadline('The last ferry')).toEqual({
      characters: 14,
      words: 3,
      notes: ['A very short headline can leave out what the piece is about.'],
    });
    const long = checkHeadline(
      'How the last night ferry to the outer islands changed the way three villages lived',
    );
    expect(long.notes[0]).toMatch(/after about 60 characters/);
  });

  test('the citation check counts each cited key in a document', () => {
    const counts = new Map<string, number>();
    countCitations(
      {
        type: 'doc',
        content: [
          { type: 'paragraph', content: [{ type: 'cite', attrs: { key: 'osei2021' } }] },
          {
            type: 'paragraph',
            content: [
              { type: 'cite', attrs: { key: 'osei2021', page: '4' } },
              { type: 'cite', attrs: { key: 'hale2020' } },
            ],
          },
        ],
      },
      counts,
    );
    expect([...counts]).toEqual([
      ['osei2021', 2],
      ['hale2020', 1],
    ]);
  });
});
