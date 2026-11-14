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

describe('count rule 2 (Ellipsus comparison, October 2026)', () => {
  // Word and Scrivener count a hyphenated word, a slash pair, an address and a time as one word.
  test.each([
    ['a well-known state-of-the-art lab', 4],
    ['Jean-Luc read the x-ray', 4],
    ['and/or', 1],
    ['at 10:30 sharp', 3],
    ['see https://vlo.app/a-b?x=1 now', 3],
    ['write to mira.ledger@example.org today', 4],
    ['non\u2011breaking and soft\u2010hyphen', 3],
  ])('%j has %i words', (text, words) => {
    expect(countWords(text)).toBe(words);
  });

  // A dash stands between two words, so they stay two words.
  test.each([
    ['She—no, he—ran', 4],
    ['pre--war', 2],
    ['wait - what', 2],
    ['- a list item', 3],
  ])('%j has %i words', (text, words) => {
    expect(countWords(text)).toBe(words);
  });

  test('a joined word in a Chinese or Japanese project still counts its characters', () => {
    expect(countWords('東京-大阪', 'ja')).toBe(4);
    expect(countWords('e-mail 我爱', 'zh')).toBe(3);
  });

  test('an address in Japanese or Chinese text ends at the next Han or kana character', () => {
    // 詳しくは (4) + the address (1) + を見てください (7) = 12, and the full stop counts nothing.
    expect(countWords('詳しくはhttps://example.comを見てください。', 'ja')).toBe(12);
    // 連絡は (3) + the address (1) + までお願いします (8) = 12.
    expect(countWords('連絡はtaro@example.comまでお願いします。', 'ja')).toBe(12);
    expect(countWords('网址www.vlo.app。谢谢', 'zh')).toBe(5);
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
