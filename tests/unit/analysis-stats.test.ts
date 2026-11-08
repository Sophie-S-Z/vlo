import { syllable } from 'syllable';
import { describe, expect, test } from 'vitest';
import { cleanPrefs, ANALYSIS_DEFAULTS } from '@/features/analysis/analysisPrefs';
import { metricText } from '@/features/analysis/StatsBar';
import { durationLabel, easeLabel, fullStats, gradeLevel } from '@/features/analysis/stats';
import { paragraphsOf, plainChars, sentencesOf, wordsOf } from '@/features/analysis/text';

const SAMPLE =
  'The cat sat on the mat. It was a sunny day, and the cat was happy.\n\n' +
  'Later, the dog came home. The dog was tired. The cat was not impressed by the tired dog.';

describe('text units', () => {
  test('plainChars keeps the length and straightens quotes and spaces', () => {
    const source = '“Hi,” she said ’twas';
    const plain = plainChars(source);
    expect(plain).toHaveLength(source.length);
    expect(plain).toBe('"Hi," she said \'twas');
  });

  test('sentences carry their places and paragraph numbers', () => {
    const sentences = sentencesOf(SAMPLE);
    expect(sentences.map((s) => s.paragraph)).toEqual([0, 0, 1, 1, 1]);
    for (const s of sentences) expect(SAMPLE.slice(s.from, s.to)).toBe(s.text);
    expect(sentences[0]?.words.map((w) => w.lower)).toEqual(['the', 'cat', 'sat', 'on', 'the', 'mat']);
  });

  test('paragraphs and words', () => {
    expect(paragraphsOf('One.\n\n  Two.  \n')).toEqual([
      { from: 0, to: 4 },
      { from: 8, to: 12 },
    ]);
    expect(wordsOf("Don't stop", 10).map((w) => [w.lower, w.from])).toEqual([
      ["don't", 10],
      ['stop', 16],
    ]);
  });
});

describe('fullStats', () => {
  const stats = fullStats(SAMPLE, 'prose', syllable);

  test('counts like a word-count site', () => {
    expect(stats.words).toBe(34);
    expect(stats.sentences).toBe(5);
    expect(stats.paragraphs).toBe(2);
    expect(stats.characters).toBe(SAMPLE.length - 2);
    expect(stats.uniqueWords).toBeLessThan(stats.words);
    expect(stats.longestSentence?.words).toBe(10);
    expect(stats.shortestSentence?.words).toBe(4);
  });

  test('readability scores fall in the expected range for simple text', () => {
    const r = stats.readability;
    expect(r).not.toBeNull();
    expect(r?.fleschEase).toBeGreaterThan(80);
    expect(r?.fleschKincaid).toBeLessThan(5);
    expect(r?.grade).toBeLessThan(6);
  });

  test('keyword density leaves out small words and counts phrases', () => {
    expect(stats.keywords[0]).toMatchObject({ phrase: 'cat', count: 3 });
    expect(stats.keywords.some((k) => k.phrase === 'the')).toBe(false);
    expect(stats.phrases2.find((k) => k.phrase === 'tired dog')).toBeUndefined();
    expect(stats.keywords[0]?.density).toBeCloseTo((100 * 3) / 34, 1);
  });

  test('a poem counts lines', () => {
    expect(fullStats('Roses are red\nViolets are blue\n\nSugar is sweet', 'poem', syllable).paragraphs).toBe(
      3,
    );
  });

  test('passive voice and long sentences', () => {
    const passive = fullStats(
      'The letter was written by Ana. She was tired. The door is being painted.',
      'prose',
      syllable,
    );
    expect(passive.passive.map((p) => p.text)).toEqual(['was written', 'being painted']);
    const long = fullStats(`${'word '.repeat(30)}end.`, 'prose', syllable);
    expect(long.longSentences).toHaveLength(1);
  });

  test('an empty text has no readability', () => {
    const empty = fullStats('', 'prose', syllable);
    expect(empty.words).toBe(0);
    expect(empty.readability).toBeNull();
    expect(empty.readingMinutes).toBe(0);
  });
});

describe('labels', () => {
  test('durations, grades and ease', () => {
    expect(durationLabel(0)).toBe('none');
    expect(durationLabel(0.5)).toBe('30 sec');
    expect(durationLabel(3.4)).toBe('about 3 min');
    expect(durationLabel(80)).toBe('about 1 h 20 min');
    expect(gradeLevel(8.2)).toBe('8th grade');
    expect(gradeLevel(2)).toBe('2nd grade');
    expect(gradeLevel(14)).toBe('college');
    expect(easeLabel(65)).toBe('plain English');
  });

  test('the bar text for each count', () => {
    const stats = fullStats(SAMPLE, 'prose', syllable);
    expect(metricText('words', stats, 'prose')).toBe('34 words');
    expect(metricText('paragraphs', stats, 'poem')).toBe('2 lines');
    expect(metricText('reading', stats, 'prose')).toBe('9 sec to read');
    expect(metricText('grade', stats, 'prose')).toMatch(/^grade \d/);
  });

  test('the bar settings clean damaged values', () => {
    expect(cleanPrefs(null)).toEqual(ANALYSIS_DEFAULTS);
    expect(cleanPrefs({ bar: false, metrics: ['pages', 'nope', 'words'] })).toEqual({
      bar: false,
      metrics: ['words', 'pages'],
    });
  });
});
