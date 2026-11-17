import { Editor } from '@tiptap/core';
import * as Y from 'yjs';
import { afterEach, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import { flushEntry, resetPending } from '@/features/authorship/record';
import { AuthorshipCount } from '@/features/authorship/sourcePlugin';
import { backUpProject, importBackup, readBackup } from '@/features/backup/backup';
import { proseExtensions } from '@/features/editor/extensions/prose';
import { createProject } from '@/features/library/projects';
import { addRecording } from '@/features/research/research';
import { deleteNaturalVoices, deleteSpeechModels } from '@/features/voice/deleteModels';
import { cacheKey, RUNTIME_CACHE, type HostedModel } from '@/features/voice/hosted';
import {
  downloadModel,
  getSpeechModel,
  MODEL_CACHE,
  modelReady,
  setSpeechModel,
  SPEECH_ENGINE_CACHE,
  SPEECH_MODELS,
} from '@/features/voice/model';
import { NATURAL_VOICES, VOICE_ENGINE_CACHE } from '@/features/voice/natural';
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

/** Puts every file of `model` in its cache, as a finished download does. */
async function putModel(model: HostedModel) {
  const cache = await caches.open(model.cache);
  for (const [path] of model.files) await cache.put(cacheKey(model, path), new Response('{}'));
}

describe('the speech models', () => {
  test('the most accurate model is the default, and the choice stays on this device', () => {
    localStorage.clear();
    expect(getSpeechModel()).toBe('small');
    setSpeechModel('base');
    expect(getSpeechModel()).toBe('base');
    localStorage.clear();
  });

  test('with the model off, a check sends nothing, and a cut download keeps nothing', async () => {
    expect(await modelReady('small')).toBe(false);
    expect(fetches).toEqual([]);

    await expect(downloadModel('small', () => undefined)).rejects.toThrow(
      'The download of config.json was not complete.',
    );
    expect(fetches).toEqual([
      'https://huggingface.co/onnx-community/whisper-small/resolve/36050c46d777d46dc4b5f43f6d90574fc38f8732/config.json',
    ]);
    expect(caches.stores.get(MODEL_CACHE)?.size).toBe(0);
    const log = await db.networkLog.toArray();
    expect(log.map((e) => [e.purpose, e.host])).toEqual([['model-download', 'huggingface.co']]);
  });

  test('each model is ready only with all of its files, and the two share one cache', async () => {
    await putModel(SPEECH_MODELS.base);
    expect(await modelReady('base')).toBe(true);
    expect(await modelReady('small')).toBe(false);
    await putModel(SPEECH_MODELS.small);
    expect(await modelReady('small')).toBe(true);
    expect([...caches.stores.keys()]).toEqual([MODEL_CACHE]);
  });

  test('Delete frees the models and their code, and the shared runtime only when nothing needs it', async () => {
    await putModel(SPEECH_MODELS.small);
    await putModel(NATURAL_VOICES);
    for (const name of [SPEECH_ENGINE_CACHE, VOICE_ENGINE_CACHE, RUNTIME_CACHE]) await caches.open(name);

    await deleteSpeechModels();
    expect(await modelReady('small')).toBe(false);
    // The natural voices still run on the shared runtime.
    expect([...caches.stores.keys()].sort()).toEqual(
      [NATURAL_VOICES.cache, VOICE_ENGINE_CACHE, RUNTIME_CACHE].sort(),
    );

    await deleteNaturalVoices();
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

    const model = SPEECH_MODELS.small.id;
    const samples = Float32Array.from({ length: 16_000 }, (_, i) => Math.sin(i / 10));
    self.onmessage?.(new MessageEvent('message', { data: { id: 7, model, samples, language: 'en' } }));
    await vi.waitFor(() => {
      expect(replies).toHaveLength(1);
    });
    expect(replies[0]).toEqual({ id: 7, text: 'The tide came in. Mira ran.' });
    // jsdom has no WebGPU, so the model runs on WASM.
    expect(pipeline).toHaveBeenCalledWith('automatic-speech-recognition', model, {
      dtype: 'q8',
      device: 'wasm',
    });
    expect(asr).toHaveBeenCalledWith(samples, {
      task: 'transcribe',
      language: 'en',
      chunk_length_s: 30,
      stride_length_s: 5,
    });
    // The same model serves the next clip without a new load.
    self.onmessage?.(new MessageEvent('message', { data: { id: 8, model, samples } }));
    await vi.waitFor(() => {
      expect(replies).toHaveLength(2);
    });
    expect(pipeline).toHaveBeenCalledOnce();
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
  // A focused editor takes the words at once. An editor with no focus focuses in the next frame and
  // scrolls to the caret, which jsdom cannot measure.
  editor.view.focus();
  expect(editor.view.hasFocus()).toBe(true);
  expect(insertDictation(editor, '  We left at dawn. ')).toBe(true);
  expect(insertDictation(editor, '   ')).toBe(false);
  expect(editor.getText()).toBe('It began. We left at dawn.');
  await flushEntry('p1');
  const [entry] = await db.authorship.toArray();
  expect(entry).toMatchObject({ dictated: 17, typed: 0 });
  editor.destroy();
});
