import { vloFetch } from '@/lib/net';

/*
 * The speech-to-text model (roadmap F57, plan Task K9, decision K4): Whisper base, 8-bit, in many
 * languages. It downloads only when the writer asks, through `vloFetch`, so each file goes in the network
 * log. The files stay in Cache Storage, and the worker reads them only from there.
 */

export const MODEL_ID = 'onnx-community/whisper-base';
/** The commit of the model files, so each device gets the same files. */
const REVISION = '27a07b4b52b3a4c5886134bb4320e93e1a4bbc7c';
export const MODEL_CACHE = 'vlo-speech-model';
/** The service worker's cache of the speech worker and its ONNX Runtime file (vite.config.ts). */
const ENGINE_CACHE = 'vlo-speech-engine';

/** Each file that the model needs, with its size in bytes at REVISION. */
const FILES: readonly (readonly [path: string, bytes: number])[] = [
  ['config.json', 2243],
  ['generation_config.json', 3832],
  ['preprocessor_config.json', 339],
  ['tokenizer_config.json', 282_682],
  ['tokenizer.json', 2_480_466],
  ['onnx/encoder_model_quantized.onnx', 23_201_314],
  ['onnx/decoder_model_merged_quantized.onnx', 53_693_315],
];

const TOTAL = FILES.reduce((sum, [, bytes]) => sum + bytes, 0);
export const MODEL_SIZE = `${String(Math.round(TOTAL / 1_000_000))} MB`;

const fileUrl = (revision: string, path: string) =>
  `https://huggingface.co/${MODEL_ID}/resolve/${revision}/${path}`;
// The worker asks for each file at the "main" revision, so the cache keeps it under that address.
const cacheKey = (path: string) => fileUrl('main', path);

/** True when every file of the model is on this device. */
export async function modelReady(): Promise<boolean> {
  if (!(await caches.has(MODEL_CACHE))) return false;
  const cache = await caches.open(MODEL_CACHE);
  for (const [path] of FILES) if (!(await cache.match(cacheKey(path)))) return false;
  return true;
}

/** Downloads the files that are not on this device yet. `onProgress` gets the share done, 0 to 1. */
export async function downloadModel(
  onProgress: (share: number) => void,
  signal?: AbortSignal,
): Promise<void> {
  const cache = await caches.open(MODEL_CACHE);
  let done = 0;
  for (const [path, bytes] of FILES) {
    if (!(await cache.match(cacheKey(path)))) {
      const response = await vloFetch(fileUrl(REVISION, path), {
        purpose: 'model-download',
        ...(signal ? { signal } : {}),
      });
      if (!response.ok || !response.body) throw new Error(`The download of ${path} failed.`);
      const parts: Uint8Array[] = [];
      let got = 0;
      const reader = response.body.getReader();
      for (let read = await reader.read(); !read.done; read = await reader.read()) {
        parts.push(read.value);
        got += read.value.byteLength;
        onProgress((done + Math.min(got, bytes)) / TOTAL);
      }
      // A cut or changed file never goes in the cache.
      if (got !== bytes) throw new Error(`The download of ${path} was not complete.`);
      await cache.put(cacheKey(path), new Response(new Blob(parts as BlobPart[])));
    }
    done += bytes;
    onProgress(done / TOTAL);
  }
}

/** Removes the model and the code that runs it from this device. */
export async function deleteModel(): Promise<void> {
  await Promise.all([caches.delete(MODEL_CACHE), caches.delete(ENGINE_CACHE)]);
}
