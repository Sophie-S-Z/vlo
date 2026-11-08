import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import { checkAi, MIN_REPORT_WORDS, tellsByGroup } from '@/features/analysis/ai/detect';
import { FEATURE_NAMES, featureInput, featuresOf } from '@/features/analysis/ai/features';
import { integrityFlags } from '@/features/analysis/ai/integrity';
import { MODEL } from '@/features/analysis/ai/model';
import { findTells } from '@/features/analysis/ai/tells';

const sample = (name: string) =>
  readFileSync(join('scripts/ai-detector-data/newer-model/test', name), 'utf8');

// The opening of Pride and Prejudice (1813), public domain: published human prose.
const AUSTEN = `It is a truth universally acknowledged, that a single man in possession of a good fortune, must be in want of a wife.

However little known the feelings or views of such a man may be on his first entering a neighbourhood, this truth is so well fixed in the minds of the surrounding families, that he is considered the rightful property of some one or other of their daughters.

"My dear Mr. Bennet," said his lady to him one day, "have you heard that Netherfield Park is let at last?"

Mr. Bennet replied that he had not.

"But it is," returned she; "for Mrs. Long has just been here, and she told me all about it."

Mr. Bennet made no answer.

"Do you not want to know who has taken it?" cried his wife impatiently.

"You want to tell me, and I have no objection to hearing it."

This was invitation enough.

"Why, my dear, you must know, Mrs. Long says that Netherfield is taken by a young man of large fortune from the north of England; that he came down on Monday in a chaise and four to see the place, and was so much delighted with it, that he agreed with Mr. Morris immediately; that he is to take possession before Michaelmas, and some of his servants are to be in the house by the end of next week."

"What is his name?"

"Bingley."

"Is he married or single?"

"Oh! Single, my dear, to be sure! A single man of large fortune; four or five thousand a year. What a fine thing for our girls!"`;

describe('the AI writing model', () => {
  test('the shipped model matches the feature code', () => {
    expect(MODEL.features).toEqual(FEATURE_NAMES);
    expect(MODEL.means).toHaveLength(FEATURE_NAMES.length);
    expect(MODEL.hidden[0]).toHaveLength(FEATURE_NAMES.length);
    expect(MODEL.looseThreshold).toBeLessThan(MODEL.threshold);
  });

  test('a text in the default style of an AI essay shows many signs', () => {
    const report = checkAi(sample('14.txt'));
    expect(report.enough).toBe(true);
    expect(report.band).toBe('many');
    expect(report.share).toBeGreaterThan(0.5);
    expect(report.tellLevel).not.toBe('typical');
  });

  test('published human fiction does not show many signs', () => {
    const report = checkAi(AUSTEN);
    expect(report.words).toBeGreaterThan(MIN_REPORT_WORDS);
    expect(report.band).not.toBe('many');
  });

  test('a short text gives no overall result', () => {
    const report = checkAi('A short note. It has few words.');
    expect(report.enough).toBe(false);
    expect(report.sentences.every((s) => !s.marked)).toBe(true);
  });

  test('each sentence score is in its place and between 0 and 1', () => {
    const text = sample('03.txt');
    const report = checkAi(text);
    for (const s of report.sentences) {
      expect(s.score).toBeGreaterThanOrEqual(0);
      expect(s.score).toBeLessThanOrEqual(1);
      expect(text.slice(s.from, s.to).trim()).not.toBe('');
    }
    expect(report.signals.length).toBeGreaterThan(0);
  });

  test('features are null below the word minimum and finite above it', () => {
    expect(featuresOf(featureInput('Too short.'), new Map())).toBeNull();
    const x = featuresOf(featureInput(sample('01.txt')), new Map(MODEL.lexicon));
    expect(x).toHaveLength(FEATURE_NAMES.length);
    expect(x?.every(Number.isFinite)).toBe(true);
  });
});

describe('Humanizer signs', () => {
  test('finds each kind of sign with its place', () => {
    const text =
      "Let's delve into the rich tapestry of it—it's not just a story, but a testament. The town serves as a hub, highlighting its role. Moreover, it was fast, cheap, and good.";
    const tells = findTells(text);
    const groups = new Set(tells.map((t) => t.group));
    for (const g of ['vocabulary', 'dash', 'negation', 'copula', 'tail', 'transition', 'triplet', 'cliche'])
      expect(groups.has(g as never)).toBe(true);
    for (const t of tells) expect(text.slice(t.from, t.to)).toBe(t.text);
    expect(tellsByGroup(tells)[0]?.tells.length).toBeGreaterThanOrEqual(1);
  });

  test('a word inside a longer word is not a sign', () => {
    expect(findTells('The realmless robustness of crucially.').map((t) => t.text)).toEqual(['crucially']);
  });
});

describe('hidden text tricks', () => {
  test('finds invisible characters, look-alike letters and odd spaces', () => {
    const text = 'pl​ain аpple and more';
    const flags = integrityFlags(text);
    expect(flags.map((f) => f.kind)).toEqual(['invisible', 'lookalike', 'space']);
    expect(flags[0]?.detail).toBe('U+200B');
    expect(flags[1]?.detail).toBe('U+0430');
  });

  test('plain text and real Cyrillic words have no flags', () => {
    expect(integrityFlags('Plain text with a  no-break space. Москва.')).toEqual([]);
  });
});
