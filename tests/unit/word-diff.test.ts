import { expect, test } from 'vitest';
import { wordDiff } from '@/features/snapshots/wordDiff';

test('marks a changed word as removed and added', () => {
  expect(wordDiff('the tide goes', 'the sea goes')).toEqual([
    { kind: 'same', text: 'the ' },
    { kind: 'removed', text: 'tide' },
    { kind: 'added', text: 'sea' },
    { kind: 'same', text: ' goes' },
  ]);
});

test('spaces count, so a poem indent change shows', () => {
  const parts = wordDiff('Salt\n  Tide', 'Salt\n    Tide') ?? [];
  expect(parts.some((p) => p.kind !== 'same')).toBe(true);
  expect(
    parts
      .filter((p) => p.kind !== 'removed')
      .map((p) => p.text)
      .join(''),
  ).toBe('Salt\n    Tide');
});

test('equal texts give one unchanged part', () => {
  expect(wordDiff('same words', 'same words')).toEqual([{ kind: 'same', text: 'same words' }]);
});

test('with a time limit, a diff that takes too long gives null instead of freezing', () => {
  const words = (seed: number) =>
    Array.from({ length: 6000 }, (_, i) => `w${String((i * seed) % 997)}`).join(' ');
  const started = performance.now();
  expect(wordDiff(words(7), words(13), { timeoutMs: 20 })).toBeNull();
  expect(performance.now() - started).toBeLessThan(1000);
});

test('with a time limit, a small diff still finishes', () => {
  expect(wordDiff('the tide goes', 'the sea goes', { timeoutMs: 1000 })).toHaveLength(4);
});
