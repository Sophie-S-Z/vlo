import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { clearMarkedNames, projectMarkedNames } from '@/features/ai/projectNames';
import { db } from '@/lib/db';
import { writeItemUpdate } from '@/lib/ydocs';
import { item, updateOf } from './export-fixtures';

/* Code review fix (spec 8.2, Gate 4): a memoir AI request knows the names marked in every item. */

const named = (text: string, personId: string) => ({
  type: 'paragraph',
  content: [
    { type: 'text', text, marks: [{ type: 'privateName', attrs: { personId } }] },
    { type: 'text', text: ' came home.' },
  ],
});

beforeEach(async () => {
  await db.open();
  clearMarkedNames();
});
afterEach(async () => {
  await db.delete();
  for (const d of await indexedDB.databases())
    if (d.name?.startsWith('vlo-item-')) indexedDB.deleteDatabase(d.name);
});

describe('projectMarkedNames', () => {
  test('reads the stored items and the open editor, and reads an item again after it changes', async () => {
    const stored = item('stored', 'memory', 'Kitchen');
    const open = item('open', 'memory', 'Garden');
    await writeItemUpdate(stored.id, updateOf({ type: 'doc', content: [named('Gran', 'p1')] }, 'prose'), 1);
    // The stored copy of the open item is older than the editor's document.
    await writeItemUpdate(open.id, updateOf({ type: 'doc', content: [named('Old', 'p2')] }, 'prose'), 1);
    const openDoc = { type: 'doc', content: [named('Pip', 'p2')] };

    const first = await projectMarkedNames([stored, open], { id: open.id, doc: openDoc });
    expect(first).toEqual([
      { personId: 'p2', text: 'Pip' },
      { personId: 'p1', text: 'Gran' },
    ]);

    // Yjs merges this update into the stored document, so the item then holds both paragraphs. Their
    // order comes from random Yjs client ids, so the test sorts them.
    await writeItemUpdate(stored.id, updateOf({ type: 'doc', content: [named('Nana', 'p1')] }, 'prose'), 2);
    // The same stamp keeps the first read.
    expect(await projectMarkedNames([stored], undefined)).toEqual([{ personId: 'p1', text: 'Gran' }]);
    const changed = { ...stored, updatedAt: stored.updatedAt + 1 };
    const again = await projectMarkedNames([changed], undefined);
    expect(again.sort((a, b) => a.text.localeCompare(b.text))).toEqual([
      { personId: 'p1', text: 'Gran' },
      { personId: 'p1', text: 'Nana' },
    ]);
  });
});
