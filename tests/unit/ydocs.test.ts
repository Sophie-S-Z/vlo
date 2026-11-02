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

/** Makes one real write fail, so its error event bubbles to the database as a quota error would. */
async function failOneWrite(db: IDBDatabase) {
  await new Promise<void>((resolve) => {
    const tx = db.transaction(['custom'], 'readwrite');
    const store = tx.objectStore('custom');
    store.add(1, 'twice');
    store.add(2, 'twice'); // ConstraintError
    tx.onabort = () => {
      resolve();
    };
  });
}

describe('confirmSaved', () => {
  test('resolves when the writes are in IndexedDB', async () => {
    const open = openItemDoc('confirm-ok');
    await open.ready;
    writeLine(open.doc, 'Salt');
    await expect(open.confirmSaved(1)).resolves.toBeUndefined();
    await open.close();
  });

  test('after a failed update write it stores the whole document again', async () => {
    const open = openItemDoc('confirm-retry');
    await open.ready;
    writeLine(open.doc, 'Lost line');
    const db = open.persistence.db;
    if (!db) throw new Error('no db');
    await failOneWrite(db);
    await open.confirmSaved(1);
    // The rewrite replaced the separate updates with one full state.
    const count = await new Promise<number>((resolve) => {
      const request = db.transaction(['updates'], 'readonly').objectStore('updates').count();
      request.onsuccess = () => {
        resolve(request.result);
      };
    });
    expect(count).toBe(1);
    await open.close();
    const again = openItemDoc('confirm-retry');
    await again.ready;
    expect(readText(again.doc)).toContain('Lost line');
    await again.close();
  });

  test('rejects with QuotaExceededError when the retry also fails', async () => {
    const open = openItemDoc('confirm-full');
    await open.ready;
    writeLine(open.doc, 'Salt');
    const db = open.persistence.db;
    if (!db) throw new Error('no db');
    await failOneWrite(db);
    const real = db.transaction.bind(db);
    db.transaction = () => {
      throw new DOMException('full', 'QuotaExceededError');
    };
    await expect(open.confirmSaved(1)).rejects.toMatchObject({ name: 'QuotaExceededError' });
    db.transaction = real;
    await open.close();
  });
});
