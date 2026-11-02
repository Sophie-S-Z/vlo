import { describe, expect, test } from 'vitest';
import { countWords } from '@/lib/wordcount';
import { sortByOrder } from '@/lib/order';
import { generateLargeProject, LARGE_LONG_SCENE_WORDS, LARGE_TOTAL_WORDS } from '../fixtures/generate-large';
import { parsePoemText } from '@/features/editor/poemText';

const large = generateLargeProject(1);

describe('generateLargeProject', () => {
  test('the same seed gives the same project, and another seed does not', () => {
    const again = generateLargeProject(1);
    expect(again.items).toEqual(large.items);
    expect([...again.texts]).toEqual([...large.texts]);
    expect(generateLargeProject(2).texts.get(`large-2-002`)).not.toBe(large.texts.get('large-1-002'));
  });

  test('it holds 100,000 words within 0.5 %, counted the way Vlo counts them', () => {
    let total = 0;
    for (const text of large.texts.values()) total += countWords(text);
    expect(Math.abs(total - LARGE_TOTAL_WORDS)).toBeLessThanOrEqual(LARGE_TOTAL_WORDS * 0.005);
    expect(large.items.reduce((sum, item) => sum + item.wordCount, 0)).toBe(total);
  });

  test('it has 40 chapters, 120 scenes and 30 poems, with one 10,000-word scene', () => {
    const count = (kind: string) => large.items.filter((i) => i.kind === kind).length;
    expect(count('chapter')).toBe(40);
    expect(count('scene')).toBe(120);
    expect(count('poem')).toBe(30);
    const long = large.items.filter((i) => i.wordCount === LARGE_LONG_SCENE_WORDS);
    expect(long).toHaveLength(1);
    expect(long[0]?.title).toBe('Scene 20.2');
  });

  test('every scene sits in a chapter, every poem in the Poems section, in order', () => {
    const byId = new Map(large.items.map((i) => [i.id, i]));
    for (const item of large.items) {
      if (item.kind === 'scene') expect(byId.get(item.parentId ?? '')?.kind).toBe('chapter');
      if (item.kind === 'poem') expect(byId.get(item.parentId ?? '')?.title).toBe('Poems');
    }
    const top = sortByOrder(large.items.filter((i) => i.parentId === null)).map((i) => i.title);
    expect(top[0]).toBe('Chapter 1');
    expect(top.at(-1)).toBe('Poems');
  });

  test('poems have stanzas and keep their leading spaces', () => {
    const poem = large.texts.get(large.items.find((i) => i.kind === 'poem')?.id ?? '') ?? '';
    const stanzas = parsePoemText(poem);
    expect(stanzas.length).toBeGreaterThanOrEqual(3);
    expect(large.items.find((i) => i.kind === 'poem')?.lineCount).toBe(stanzas.flat().length);
    const allLines = large.items
      .filter((i) => i.kind === 'poem')
      .flatMap((i) => parsePoemText(large.texts.get(i.id) ?? '').flat());
    expect(allLines.some((line) => line.text.startsWith('    '))).toBe(true);
    expect(allLines.some((line) => /\S {4}\S/.test(line.text))).toBe(true);
  });
});
