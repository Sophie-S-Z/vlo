import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { parsePoemText, poemDataToText, type PoemData } from '@/features/editor/poemText';

const fixture = readFileSync('tests/fixtures/poem.txt', 'utf8');

describe('parsePoemText', () => {
  test('the fixture parses to 3 stanzas of 4, 3 and 1 lines', () => {
    const poem = parsePoemText(fixture);
    expect(poem.map((stanza) => stanza.length)).toEqual([4, 3, 1]);
  });

  test('leading spaces stay', () => {
    const poem = parsePoemText(fixture);
    expect(poem[0]?.[1]?.text).toBe('    The tide goes out');
    expect(poem[0]?.[3]?.text).toBe('            one board at a time.');
  });

  test('internal runs of spaces stay', () => {
    expect(parsePoemText(fixture)[1]?.[0]?.text).toBe('I keep    the kettle    warm');
  });

  test('trailing spaces on a line stay', () => {
    expect(parsePoemText('wind   \nrain\n')[0]?.map((l) => l.text)).toEqual(['wind   ', 'rain']);
  });

  test('Windows line ends become plain line ends', () => {
    expect(parsePoemText('a\r\nb\r\n\r\nc\r\n')).toEqual(parsePoemText('a\nb\n\nc\n'));
  });

  test('no-break spaces become plain spaces', () => {
    expect(parsePoemText('\u00a0\u00a0Salt')[0]?.[0]?.text).toBe('  Salt');
  });

  test('several blank lines make one stanza break', () => {
    expect(parsePoemText('a\n\n\n\nb').map((s) => s.length)).toEqual([1, 1]);
  });

  test('every line starts with no hanging indent', () => {
    expect(
      parsePoemText(fixture)
        .flat()
        .every((l) => l.hanging === 0),
    ).toBe(true);
  });

  test('empty text is an empty poem', () => {
    expect(parsePoemText('')).toEqual([]);
    expect(poemDataToText([])).toBe('');
  });
});

describe('poemDataToText', () => {
  test('the fixture round trip is byte-identical', () => {
    expect(poemDataToText(parsePoemText(fixture))).toBe(fixture);
  });

  test('parse is the inverse of poemDataToText', () => {
    const poem: PoemData = [
      [
        { text: '  one', hanging: 0 },
        { text: 'two  ', hanging: 2 },
      ],
      [{ text: '\tthree', hanging: 0 }],
    ];
    const back = parsePoemText(poemDataToText(poem));
    expect(back.flat().map((l) => l.text)).toEqual(poem.flat().map((l) => l.text));
    expect(back.map((s) => s.length)).toEqual([2, 1]);
  });
});
