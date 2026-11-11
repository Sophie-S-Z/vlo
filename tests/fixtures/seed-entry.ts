import { getSchema } from '@tiptap/core';
import { prosemirrorJSONToYDoc, yXmlFragmentToProseMirrorRootNode } from '@tiptap/y-tiptap';
import { IndexeddbPersistence } from 'y-indexeddb';
import * as Y from 'yjs';
import { poemExtensions } from '@/features/editor/extensions/poem';
import { proseExtensions } from '@/features/editor/extensions/prose';
import { parsePoemText, poemDataFromDoc, poemDataToJSON, type PoemData } from '@/features/editor/poemText';
import { db } from '@/lib/db';
import { itemDocName } from '@/lib/itemDocName';
import { YFRAGMENT } from '@/lib/ydocs';
import { generateLargeProject, LARGE_LONG_SCENE_WORDS } from './generate-large';

/*
 * A browser bundle for end-to-end tests. global-setup.ts builds it, and a test adds it to the page.
 * It writes through the same Dexie schema and y-indexeddb format that Vlo uses, so the app reads the
 * seeded project exactly as it reads one a writer made.
 */

const proseSchema = getSchema(proseExtensions(new Y.Doc()));
const poemSchema = getSchema(poemExtensions(new Y.Doc(), { tabSpaces: 4 }));

function proseJSON(text: string) {
  return {
    type: 'doc',
    content: text.split('\n\n').map((paragraph) => ({
      type: 'paragraph',
      content: [{ type: 'text', text: paragraph }],
    })),
  };
}

async function storeDoc(itemId: string, doc: Y.Doc): Promise<void> {
  // y-indexeddb writes the document's current state when it first opens the database.
  const persistence = new IndexeddbPersistence(itemDocName(itemId), doc);
  await persistence.whenSynced;
  await persistence.destroy();
  doc.destroy();
}

export interface SeededLarge {
  projectId: string;
  longSceneId: string;
  longSceneTitle: string;
  /** The last words of the long scene, to wait for on screen. */
  longSceneEnd: string;
}

async function large(seed: number, words?: number): Promise<SeededLarge> {
  const { project, items, texts } = generateLargeProject(seed, words);
  const now = Date.now();
  await db.transaction('rw', db.projects, db.items, db.itemTexts, async () => {
    await db.projects.put(project);
    await db.items.bulkPut(items);
    await db.itemTexts.bulkPut(
      [...texts].map(([itemId, text]) => ({ itemId, projectId: project.id, text, updatedAt: now })),
    );
  });
  const byId = new Map(items.map((i) => [i.id, i]));
  const jobs = [...texts].map(([itemId, text]) => {
    const poem = byId.get(itemId)?.kind === 'poem';
    const doc = poem
      ? prosemirrorJSONToYDoc(poemSchema, poemDataToJSON(parsePoemText(text)), YFRAGMENT)
      : prosemirrorJSONToYDoc(proseSchema, proseJSON(text), YFRAGMENT);
    return () => storeDoc(itemId, doc);
  });
  // A few databases at a time, so the browser does not hold 150 open at once.
  for (let i = 0; i < jobs.length; i += 10) await Promise.all(jobs.slice(i, i + 10).map((job) => job()));

  const long = items.find((i) => i.wordCount === LARGE_LONG_SCENE_WORDS);
  if (!long) throw new Error('The large project has no long scene.');
  const longText = texts.get(long.id) ?? '';
  return {
    projectId: project.id,
    longSceneId: long.id,
    longSceneTitle: long.title,
    longSceneEnd: longText.slice(-40),
  };
}

/** Reads a poem item's stored document straight from IndexedDB, as a reload would see it. */
async function readPoem(itemId: string): Promise<PoemData> {
  const updates = await new Promise<Uint8Array[]>((resolve, reject) => {
    const open = indexedDB.open(itemDocName(itemId));
    open.onerror = () => {
      reject(open.error ?? new Error('open failed'));
    };
    open.onsuccess = () => {
      const database = open.result;
      const request = database.transaction('updates').objectStore('updates').getAll();
      request.onsuccess = () => {
        database.close();
        resolve(request.result as Uint8Array[]);
      };
      request.onerror = () => {
        database.close();
        reject(request.error ?? new Error('read failed'));
      };
    };
  });
  const doc = new Y.Doc();
  for (const update of updates) Y.applyUpdate(doc, update);
  const node = yXmlFragmentToProseMirrorRootNode(doc.getXmlFragment(YFRAGMENT), poemSchema);
  doc.destroy();
  return poemDataFromDoc(node);
}

const api = { large, readPoem };
export type VloSeed = typeof api;
(window as unknown as { vloSeed: VloSeed }).vloSeed = api;
