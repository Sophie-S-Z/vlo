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
  const parts = wordDiff('Salt\n  Tide', 'Salt\n    Tide');
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
