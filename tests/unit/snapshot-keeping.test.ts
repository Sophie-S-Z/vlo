import { Editor } from '@tiptap/core';
import { yXmlFragmentToProseMirrorRootNode } from '@tiptap/y-tiptap';
import * as Y from 'yjs';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { docSchema, DOC_SCHEMA, stampDocSchema } from '@/features/editor/docSchema';
import { poemExtensions } from '@/features/editor/extensions/poem';
import { proseExtensions } from '@/features/editor/extensions/prose';
import { parsePoemText, poemDataFromDoc, poemDataToJSON } from '@/features/editor/poemText';
import { contentState } from '@/features/snapshots/packing';
import { BEFORE_RESTORE, BEFORE_SYNC, takeSnapshot, thinnedIds } from '@/features/snapshots/snapshots';
import { clock } from '@/lib/clock';
import { db } from '@/lib/db';
import { docFromUpdate, YFRAGMENT } from '@/lib/ydocs';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
// Tuesday 24 November 2026, at noon on the device.
const NOW = new Date(2026, 10, 24, 12).getTime();
const at = (month: number, day: number, hour: number) => new Date(2026, month, day, hour).getTime();

let next = 0;
const snap = (createdAt: number, label?: string) => ({
  id: `s${String((next += 1))}`,
  createdAt,
  ...(label === undefined ? {} : { label }),
});

describe('thinning', () => {
  test('every automatic snapshot of the last day stays', () => {
    const rows = [snap(NOW - 23 * HOUR), snap(NOW - 2 * HOUR), snap(NOW - 60_000)];
    expect(thinnedIds(rows, NOW)).toEqual([]);
  });

  test('after a day, only the newest snapshot of each day stays', () => {
    const early = snap(at(10, 20, 9));
    const late = snap(at(10, 20, 17));
    const otherDay = snap(at(10, 21, 8));
    expect(thinnedIds([early, late, otherDay], NOW)).toEqual([early.id]);
  });

  test('after 30 days, only the newest snapshot of each week stays, from Monday', () => {
    // Monday 5 and Sunday 11 October are one week. Monday 12 October starts the next.
    const monday = snap(at(9, 5, 10));
    const sunday = snap(at(9, 11, 10));
    const nextMonday = snap(at(9, 12, 10));
    expect(NOW - sunday.createdAt).toBeGreaterThan(30 * DAY);
    expect(thinnedIds([monday, sunday, nextMonday], NOW)).toEqual([monday.id]);
  });

  test('a snapshot of a step of the writer always stays, and a "Before sync" one thins', () => {
    const mine = snap(at(10, 1, 9), 'Saved by you');
    const restore = snap(at(10, 1, 10), BEFORE_RESTORE);
    const sync = snap(at(10, 1, 11), BEFORE_SYNC);
    const timer = snap(at(10, 1, 12));
    expect(thinnedIds([mine, restore, sync, timer], NOW)).toEqual([sync.id]);
  });
});

describe('the stored snapshots', () => {
  const realNow = clock.now.bind(clock);
  let now = NOW;
  beforeEach(async () => {
    await db.open();
    clock.now = () => now;
  });
  afterEach(async () => {
    clock.now = realNow;
    await db.delete();
  });

  test('a new snapshot thins the older automatic snapshots of its item only', async () => {
    const doc = new Y.Doc();
    const item = { id: 'item-1', projectId: 'project-1' };
    const other = { id: 'item-2', projectId: 'project-1' };
    for (const time of [at(10, 20, 9), at(10, 20, 17)]) {
      now = time;
      await takeSnapshot(item, doc, 'words');
      await takeSnapshot(other, doc, 'words');
    }
    now = NOW;
    const fresh = await takeSnapshot(item, doc, 'words');

    const left = (itemId: string) =>
      db.snapshots
        .where('itemId')
        .equals(itemId)
        .toArray()
        .then((rows) => rows.map((r) => r.createdAt).sort((a, b) => a - b));
    expect(await left('item-1')).toEqual([at(10, 20, 17), fresh.createdAt]);
    expect(await left('item-2')).toEqual([at(10, 20, 9), at(10, 20, 17)]);
    doc.destroy();
  });

  test('a snapshot of a step of the writer thins nothing, so a restore keeps the one that it restored', async () => {
    const doc = new Y.Doc();
    const item = { id: 'item-1', projectId: 'project-1' };
    for (const time of [at(10, 20, 9), at(10, 20, 17)]) {
      now = time;
      await takeSnapshot(item, doc, 'words');
    }
    now = NOW;
    await takeSnapshot(item, doc, 'words', BEFORE_RESTORE);
    await takeSnapshot(item, doc, 'words', 'Saved by you');
    expect(await db.snapshots.where('itemId').equals('item-1').count()).toBe(4);
    doc.destroy();
  });
});

describe('contentState', () => {
  let editor: Editor;
  let doc: Y.Doc;
  function mount(kind: 'prose' | 'poem') {
    doc = new Y.Doc();
    const host = document.createElement('div');
    document.body.append(host);
    editor = new Editor({
      element: host,
      extensions: kind === 'prose' ? proseExtensions(doc) : poemExtensions(doc, { tabSpaces: 4 }),
    });
  }
  afterEach(() => {
    editor.destroy();
    doc.destroy();
    document.body.replaceChildren();
  });

  const reread = (state: Uint8Array): unknown => {
    const copy = docFromUpdate(state);
    try {
      return yXmlFragmentToProseMirrorRootNode(
        copy.getXmlFragment(YFRAGMENT),
        editor.schema,
      ).toJSON() as unknown;
    } finally {
      copy.destroy();
    }
  };

  test('keeps every node, mark and attribute of the text, and the schema stamp', () => {
    mount('prose');
    editor.commands.setContent(
      '<h2>The harbour</h2><p style="text-align: center">Salt <strong>on</strong> the <em>glass</em>.</p>' +
        '<blockquote><p>Gulls.</p></blockquote><ul><li><p>Rope</p></li><li><p>Tar</p></li></ul>',
    );
    stampDocSchema(doc);
    const state = contentState(doc);
    expect(reread(state)).toEqual(editor.getJSON());
    const copy = docFromUpdate(state);
    expect(docSchema(copy)).toBe(DOC_SCHEMA);
    copy.destroy();
  });

  test('keeps a newline at the end of a run of text', () => {
    mount('prose');
    const source = new Y.Doc();
    const paragraph = new Y.XmlElement('paragraph');
    paragraph.insert(0, [new Y.XmlText('tide\n')]);
    source.getXmlFragment(YFRAGMENT).insert(0, [paragraph]);
    const copy = docFromUpdate(contentState(source));
    expect(copy.getXmlFragment(YFRAGMENT).toJSON()).toBe('<paragraph>tide\n</paragraph>');
    copy.destroy();
    source.destroy();
  });

  test('keeps every space, stanza and hanging indent of a poem', () => {
    mount('poem');
    editor.commands.setContent(poemDataToJSON(parsePoemText('Salt\n    on the  sill\n\nTide\n')));
    editor.commands.setTextSelection(3);
    editor.commands.setHanging(3);
    const copy = docFromUpdate(contentState(doc));
    const node = yXmlFragmentToProseMirrorRootNode(copy.getXmlFragment(YFRAGMENT), editor.schema);
    expect(poemDataFromDoc(node)).toEqual(poemDataFromDoc(editor.state.doc));
    copy.destroy();
  });

  test('leaves out the edit history, so it is smaller than the whole state', () => {
    mount('prose');
    editor.commands.setContent('<p></p>');
    // Typing, one key at a time, that takes back every third word and types it again.
    const type = (word: string) => {
      for (const key of word) editor.commands.insertContent(key);
    };
    for (let i = 0; i < 150; i += 1) {
      type('tide ');
      if (i % 3 > 0) continue;
      const end = editor.state.selection.from;
      for (let key = 1; key <= 5; key += 1)
        editor.commands.deleteRange({ from: end - key, to: end - key + 1 });
      type('salt ');
    }
    const whole = Y.encodeStateAsUpdate(doc);
    const content = contentState(doc);
    expect(reread(content)).toEqual(editor.getJSON());
    expect(content.length).toBeLessThan(whole.length * 0.6);
  });
});
