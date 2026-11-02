import { describe, expect, test } from 'vitest';
import { countLines, countWords } from '@/lib/wordcount';

describe('countWords', () => {
  test.each([
    ['', 0],
    ['Salt on the sill.', 4],
    ["don't stop", 2],
    ['    The tide', 2],
    ['the summer of 1994', 4],
    ['one\n\ntwo', 2],
    ['— , . !', 0],
  ])('%j has %i words', (text, words) => {
    expect(countWords(text)).toBe(words);
  });

  test('counts words in a language without spaces', () => {
    expect(countWords('雨が降る', 'ja')).toBeGreaterThan(0);
  });
});

describe('countLines', () => {
  test('counts non-empty lines and ignores stanza breaks', () => {
    expect(countLines('Salt on the sill.\n    The tide goes out\n\nI keep the kettle warm\n')).toBe(3);
    expect(countLines('')).toBe(0);
    expect(countLines('   \n\n')).toBe(0);
  });
});
