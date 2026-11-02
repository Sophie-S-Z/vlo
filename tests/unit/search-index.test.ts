import { expect, test } from 'vitest';
import { buildSearchIndex, snippet } from '@/features/project/searchIndex';
import type { Item, ItemText } from '@/lib/db';

function item(id: string, title: string, kind: Item['kind'] = 'poem'): Item {
  return {
    id,
    projectId: 'p',
    parentId: null,
    kind,
    title,
    status: 'draft',
    order: 'a0',
    wordCount: 0,
    createdAt: 1,
    updatedAt: 1,
  };
}
const items = [item('p1', 'Salt'), item('p2', 'Morning Ledger'), item('c1', 'Chapter 1', 'chapter')];
const texts: ItemText[] = [
  { itemId: 'p1', projectId: 'p', text: 'Salt on the sill.\n    The kettle sings\n', updatedAt: 1 },
  { itemId: 'p2', projectId: 'p', text: 'Numbers in a wet book.', updatedAt: 1 },
];

test('finds a poem by a word in its text', () => {
  const index = buildSearchIndex(texts, items);
  expect(index.search('kettle').map((r) => String(r.id))).toEqual(['p1']);
});

test('finds an item by its title, and an item with no text by its title too', () => {
  const index = buildSearchIndex(texts, items);
  expect(index.search('ledger')[0]?.id as string | undefined).toBe('p2');
  expect(index.search('chapter')[0]?.id as string | undefined).toBe('c1');
});

test('every word of a phrase must match', () => {
  const index = buildSearchIndex(texts, items);
  expect(index.search('kettle sings').map((r) => String(r.id))).toEqual(['p1']);
  expect(index.search('kettle numbers')).toEqual([]);
});

test('a snippet shows the text around the match', () => {
  expect(snippet('Salt on the sill.\n    The kettle sings\n', 'kettle')).toBe(
    'Salt on the sill. The kettle sings',
  );
  expect(snippet('No match here', 'kettle')).toBeNull();
});
