import { Editor } from '@tiptap/core';
import * as Y from 'yjs';
import { afterEach, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import { flushEntry, resetPending } from '@/features/authorship/record';
import { AuthorshipCount } from '@/features/authorship/sourcePlugin';
import { backUpProject, importBackup, readBackup } from '@/features/backup/backup';
import { proseExtensions } from '@/features/editor/extensions/prose';
import { createProject } from '@/features/library/projects';
import { addRecording } from '@/features/research/research';
import { deleteModel, downloadModel, MODEL_CACHE, MODEL_ID, modelReady } from '@/features/voice/model';
import { PROMPTS } from '@/features/voice/prompts';
import { insertDictation } from '@/features/voice/speech';
import type { TranscribeResponse } from '@/features/voice/transcribe.worker';
import { db } from '@/lib/db';

/* Plan Task K9 (roadmap F57, decision K4, Review Focus 6): memoir voice capture. */

/** Cache Storage in memory, as jsdom has none. */
function fakeCaches() {
  const stores = new Map<string, Map<string, Response>>();
  const open = (name: string) => {
    const store = stores.get(name) ?? new Map<string, Response>();
    stores.set(name, store);
    return Promise.resolve({
      match: (key: string) => Promise.resolve(store.get(key)?.clone()),
      put: (key: string, response: Response) => {
        store.set(key, response);
        return Promise.resolve();
      },
    });
  };
  return {
    stores,
    has: (name: string) => Promise.resolve(stores.has(name)),
    open,
    delete: (name: string) => Promise.resolve(stores.delete(name)),
  };
}

let caches: ReturnType<typeof fakeCaches>;
const fetches: string[] = [];

beforeAll(() => {
  Element.prototype.scrollIntoView = () => undefined;
});

beforeEach(async () => {
  await db.open();
  caches = fakeCaches();
  fetches.length = 0;
  vi.stubGlobal('caches', caches);
  vi.stubGlobal(
    'fetch',
    vi.fn((url: URL | string) => {
      fetches.push(url.toString());
      // A short body: the download must refuse it.
      return Promise.resolve(new Response('cut'));
    }),
  );
  Object.defineProperty(navigator, 'storage', {
    configurable: true,
    value: { persist: () => Promise.resolve(true) },
  });
});

afterEach(async () => {
  vi.unstubAllGlobals();
  Reflect.deleteProperty(navigator, 'storage');
  document.body.replaceChildren();
  resetPending();
  await db.delete();
  for (const d of await indexedDB.databases())
    if (d.name?.startsWith('vlo-item-')) indexedDB.deleteDatabase(d.name);
});

test('the deck has 60 questions in 6 life stages, and no question comes twice', () => {
  expect(PROMPTS).toHaveLength(6);
  for (const { questions } of PROMPTS) expect(questions).toHaveLength(10);
  const all = PROMPTS.flatMap((p) => p.questions.map((q) => q.toLowerCase()));
  expect(new Set(all).size).toBe(60);
});

test('a recording saves as a research file of its memory, and a backup and a copy keep the link', async () => {
  const { project, firstItemId } = await createProject({ title: 'Salt Year', templates: ['memoir'] });
  const audio = new Blob([new Uint8Array([1, 2, 3])], { type: 'audio/webm' });
  const clip = await addRecording(
    project.id,
    firstItemId,
    audio,
    ' What is the first thing that you can remember? ',
  );
  expect(clip).toMatchObject({ itemId: firstItemId, type: 'audio/webm', size: 3 });
  expect(clip.name).toBe('What is the first thing that you can remember?');

  const backup = await readBackup((await backUpProject(project.id, { music: false })).bytes);
  expect(backup.research.map((r) => r.info.itemId)).toEqual([firstItemId]);
  const copyId = await importBackup(backup, 'copy');
  const [copied] = await db.research.where('projectId').equals(copyId).toArray();
  const [copyItem] = await db.items.where('projectId').equals(copyId).toArray();
  expect(copied?.itemId).toBe(copyItem?.id);
  expect(copied?.itemId).not.toBe(firstItemId);
  expect(fetches).toEqual([]);
});

describe('the speech model', () => {
  test('with the model off, a check sends nothing, and a cut download keeps nothing', async () => {
    expect(await modelReady()).toBe(false);
    expect(fetches).toEqual([]);

    await expect(downloadModel(() => undefined)).rejects.toThrow(
      'The download of config.json was not complete.',
    );
    expect(fetches).toEqual([
      `https://huggingface.co/${MODEL_ID}/resolve/27a07b4b52b3a4c5886134bb4320e93e1a4bbc7c/config.json`,
    ]);
    expect(caches.stores.get(MODEL_CACHE)?.size).toBe(0);
    const log = await db.networkLog.toArray();
    expect(log.map((e) => [e.purpose, e.host])).toEqual([['model-download', 'huggingface.co']]);
  });

  test('"Delete the model" frees its cache and the cache of its code', async () => {
    const cache = await caches.open(MODEL_CACHE);
    for (const path of [
      'config.json',
      'generation_config.json',
      'preprocessor_config.json',
      'tokenizer_config.json',
      'tokenizer.json',
      'onnx/encoder_model_quantized.onnx',
      'onnx/decoder_model_merged_quantized.onnx',
    ])
      await cache.put(`https://huggingface.co/${MODEL_ID}/resolve/main/${path}`, new Response('{}'));
    await caches.open('vlo-speech-engine');
    expect(await modelReady()).toBe(true);
    await deleteModel();
    expect(await modelReady()).toBe(false);
    expect([...caches.stores.keys()]).toEqual([]);
  });

  test('a fake model in the worker turns the samples into text, from the cache only', async () => {
    vi.resetModules();
    const env = { backends: { onnx: { wasm: {} } } } as Record<string, unknown> & {
      backends: { onnx: { wasm: Record<string, unknown> } };
    };
    const asr = vi.fn(() => Promise.resolve([{ text: ' The tide came in.' }, { text: ' Mira ran. ' }]));
    const pipeline = vi.fn(() => Promise.resolve(asr));
    vi.doMock('@huggingface/transformers', () => ({ env, pipeline }));
    const replies: TranscribeResponse[] = [];
    vi.spyOn(self, 'postMessage').mockImplementation((reply: unknown) => {
      replies.push(reply as TranscribeResponse);
    });
    await import('@/features/voice/transcribe.worker');
    expect(env).toMatchObject({
      allowLocalModels: false,
      useBrowserCache: true,
      cacheKey: MODEL_CACHE,
      useWasmCache: false,
    });
    await expect((env.fetch as () => Promise<Response>)()).rejects.toThrow(
      'The speech model is not on this device.',
    );
    const paths = env.backends.onnx.wasm.wasmPaths as Record<string, string>;
    expect(Object.keys(paths)).toEqual(['wasm']);
    expect(paths.wasm).toMatch(/ort-wasm-simd-threaded\.asyncify/);

    const samples = Float32Array.from({ length: 16_000 }, (_, i) => Math.sin(i / 10));
    self.onmessage?.(new MessageEvent('message', { data: { id: 7, samples, language: 'en' } }));
    await vi.waitFor(() => {
      expect(replies).toHaveLength(1);
    });
    expect(replies[0]).toEqual({ id: 7, text: 'The tide came in. Mira ran.' });
    // jsdom has no WebGPU, so the model runs on WASM.
    expect(pipeline).toHaveBeenCalledWith('automatic-speech-recognition', MODEL_ID, {
      dtype: 'q8',
      device: 'wasm',
    });
    expect(asr).toHaveBeenCalledWith(samples, {
      task: 'transcribe',
      language: 'en',
      chunk_length_s: 30,
      stride_length_s: 5,
    });
    vi.doUnmock('@huggingface/transformers');
  });
});

test('dictated text goes in at the cursor with a space, and counts as dictated', async () => {
  const host = document.createElement('div');
  document.body.append(host);
  const editor = new Editor({
    element: host,
    extensions: [...proseExtensions(new Y.Doc()), AuthorshipCount.configure({ projectId: 'p1' })],
  });
  editor.commands.insertContent('It began.');
  await flushEntry('p1');
  await db.authorship.clear();
  expect(insertDictation(editor, '  We left at dawn. ')).toBe(true);
  expect(insertDictation(editor, '   ')).toBe(false);
  expect(editor.getText()).toBe('It began. We left at dawn.');
  await flushEntry('p1');
  const [entry] = await db.authorship.toArray();
  expect(entry).toMatchObject({ dictated: 17, typed: 0 });
  editor.destroy();
});
