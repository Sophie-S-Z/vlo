import * as Y from 'yjs';
import { describe, expect, test } from 'vitest';
import { deleteItemDoc, itemDocName } from '@/lib/itemDocName';
import { YFRAGMENT, docFromUpdate, encodeDoc, openItemDoc } from '@/lib/ydocs';

function writeLine(doc: Y.Doc, text: string) {
  const fragment = doc.getXmlFragment(YFRAGMENT);
  const paragraph = new Y.XmlElement('paragraph');
  paragraph.insert(0, [new Y.XmlText(text)]);
  fragment.insert(fragment.length, [paragraph]);
}

function readText(doc: Y.Doc): string {
  return doc.getXmlFragment(YFRAGMENT).toJSON();
}

async function databaseNames(): Promise<string[]> {
  return (await indexedDB.databases()).map((d) => d.name ?? '');
}

describe('item documents', () => {
  test('the database name follows the spec', () => {
    expect(itemDocName('abc')).toBe('vlo-item-abc');
  });

  test('text written, closed and reopened is still there', async () => {
    const first = openItemDoc('round-trip');
    await first.ready;
    writeLine(first.doc, '    The tide goes out');
    await first.close();

    const second = openItemDoc('round-trip');
    await second.ready;
    expect(readText(second.doc)).toContain('    The tide goes out');
    await second.close();
    await deleteItemDoc('round-trip');
  });

  test('deleteItemDoc removes the database', async () => {
    const open = openItemDoc('to-delete');
    await open.ready;
    writeLine(open.doc, 'gone');
    await open.close();
    expect(await databaseNames()).toContain('vlo-item-to-delete');
    await deleteItemDoc('to-delete');
    expect(await databaseNames()).not.toContain('vlo-item-to-delete');
  });

  test('an encoded document decodes to the same text', () => {
    const doc = new Y.Doc();
    writeLine(doc, 'I keep    the kettle    warm');
    const copy = docFromUpdate(encodeDoc(doc));
    expect(readText(copy)).toBe(readText(doc));
  });
});
