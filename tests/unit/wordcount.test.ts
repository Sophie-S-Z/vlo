import { describe, expect, test } from 'vitest';
import { countLines, countUnit, countWords } from '@/lib/wordcount';

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

  // Plan Task H9 (roadmap F38): Chinese and Japanese writing counts characters.
  test.each([
    ['我爱写作', 'zh', 4],
    ['東京へ行く', 'ja', 5],
    ['Vlo は便利', 'ja', 4],
    ['コーヒーを飲む。', 'ja-JP', 7],
    ['我爱写作', 'zh-Hant', 4],
    ['Salt on the sill.', 'zh', 4],
  ])('%j in %s has %i units', (text, language, units) => {
    expect(countWords(text, language)).toBe(units);
  });

  test('every other language counts words as before', () => {
    expect(countWords('Salt on the sill.', 'fr')).toBe(4);
    expect(countWords('Vlo は便利', 'en')).toBe(countWords('Vlo は便利'));
  });
});

describe('countUnit', () => {
  test('Chinese and Japanese count characters, and other languages count words', () => {
    expect([
      countUnit('zh'),
      countUnit('zh-Hans'),
      countUnit('ja'),
      countUnit('en'),
      countUnit(undefined),
    ]).toEqual(['characters', 'characters', 'characters', 'words', 'words']);
  });
});

describe('countLines', () => {
  test('counts non-empty lines and ignores stanza breaks', () => {
    expect(countLines('Salt on the sill.\n    The tide goes out\n\nI keep the kettle warm\n')).toBe(3);
    expect(countLines('')).toBe(0);
    expect(countLines('   \n\n')).toBe(0);
  });
});
