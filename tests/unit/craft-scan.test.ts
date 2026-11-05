import { dictionary } from 'cmu-pronouncing-dictionary';
import { syllable } from 'syllable';
import { describe, expect, test } from 'vitest';
import { lexiconOf, scanLines, type LineScan } from '@/features/craft/scan';

/* The Craft panel's scan (spec 8.3, plan Task C7, F19): syllables, stress and rhyme. */

const lexicon = lexiconOf(dictionary, syllable);

/** The stress of a line as marks, one for each syllable, with "?" for a word the dictionary lacks. */
const marks = (line: LineScan) =>
  line.words.flatMap((w) => w.stresses.map((s) => (s === 's' ? '/' : s === 'u' ? '˘' : '?'))).join('');

describe('syllables and stress', () => {
  test('"Shall I compare thee to a summer’s day" has 10 syllables in iambic stress', () => {
    const [line] = scanLines(['Shall I compare thee to a summer’s day?'], lexicon);
    if (!line) throw new Error('No scan.');
    expect(line.syllables).toBe(10);
    expect(marks(line)).toBe('˘/˘/˘/˘/˘/');
    expect(line.meter).toBe('iambic');
  });

  test('each word has its place in the line, so a label can sit above it', () => {
    const text = 'Thou art more lovely';
    const [line] = scanLines([text], lexicon);
    expect(line?.words.map((w) => text.slice(w.from, w.to))).toEqual(['Thou', 'art', 'more', 'lovely']);
    expect(line?.words.map((w) => w.stresses.length)).toEqual([1, 1, 1, 2]);
  });

  test('a stress inside a word comes from the dictionary when no meter fits', () => {
    const [line] = scanLines(['Beautiful'], lexicon);
    expect(line?.syllables).toBe(3);
    expect(line?.meter).toBeNull();
    expect(line ? marks(line) : '').toBe('/˘˘');
  });

  test('a trochaic line scans as trochaic', () => {
    const [line] = scanLines(['Tiger, tiger, burning bright'], lexicon);
    expect(line?.syllables).toBe(7);
    expect(line ? marks(line) : '').toBe('/˘/˘/˘/');
    expect(line?.meter).toBe('trochaic');
  });

  test('a word the dictionary lacks gets its syllables from the fallback and no stress', () => {
    const [line] = scanLines(['the glimmerwick'], lexicon);
    const word = line?.words[1];
    expect(word?.known).toBe(false);
    expect(word?.stresses.length).toBeGreaterThanOrEqual(3);
    expect(word?.stresses.every((s) => s === null)).toBe(true);
  });

  test('curly apostrophes, hyphens and numbers', () => {
    const [line] = scanLines(['’Tis the well-known hill, ‘said’ 1994'], lexicon);
    expect(line?.words.map((w) => w.text)).toEqual(['’Tis', 'the', 'well', 'known', 'hill', 'said', '1994']);
    // "’Tis" is in the dictionary with its apostrophe, and a quote mark before "said" stays out of the word.
    expect(line?.words.map((w) => w.known)).toEqual([true, true, true, true, true, true, false]);
    expect(line?.syllables).toBe(6);
  });

  test('a blank line has no labels', () => {
    expect(scanLines(['', '    '], lexicon)).toEqual([
      { syllables: 0, words: [], meter: null, rhyme: null },
      { syllables: 0, words: [], meter: null, rhyme: null },
    ]);
  });
});

describe('rhyme letters', () => {
  test('lines rhyme when their sounds match from the last stressed vowel', () => {
    const lines = [
      'Shall I compare thee to a summer’s day?',
      'Thou art more lovely and more temperate:',
      'Rough winds do shake the darling buds of May,',
      'And summer’s lease hath all too short a date;',
    ];
    // "Temperate" and "date" rhymed in Shakespeare's time. Their sounds today differ, so they get B and C.
    expect(scanLines(lines, lexicon).map((l) => l.rhyme)).toEqual(['A', 'B', 'A', 'C']);
  });

  test('two known words rhyme by their sound, not their spelling', () => {
    expect(scanLines(['the cough', 'the bough', 'the cow'], lexicon).map((l) => l.rhyme)).toEqual([
      'A',
      'B',
      'B',
    ]);
  });

  test('a rhyme on the last stressed vowel of a longer word', () => {
    expect(scanLines(['nation', 'station', 'notion'], lexicon).map((l) => l.rhyme)).toEqual(['A', 'A', 'B']);
  });

  test('blank lines get no letter, and the letters go on after Z', () => {
    const words = Array.from({ length: 28 }, (_, i) => `x${'q'.repeat(i)}zzv`);
    const scans = scanLines(['', ...words], lexicon);
    expect(scans[0]?.rhyme).toBeNull();
    expect(scans.at(-2)?.rhyme).toBe('AA');
    expect(scans.at(-1)?.rhyme).toBe('AB');
  });
});

describe('speed (Review Focus 6)', () => {
  test('a 300-line poem scans in well under the 200 ms budget', () => {
    const stanza = [
      'Shall I compare thee to a summer’s day?',
      'Thou art more lovely and more temperate:',
      'Rough winds do shake the darling buds of May,',
      'And summer’s lease hath all too short a date;',
    ];
    const poem = Array.from({ length: 75 }, () => stanza).flat();
    const start = performance.now();
    const scans = scanLines(poem, lexicon);
    const took = performance.now() - start;
    expect(scans).toHaveLength(300);
    expect(took).toBeLessThan(100);
  });
});
