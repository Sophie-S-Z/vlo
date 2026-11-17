import { vloFetch } from '@/lib/net';

/*
 * The model files that Vlo downloads from Hugging Face only when the writer asks: the speech-to-text models
 * and the natural voices. Each file goes through `vloFetch`, so it goes in the network log, and stays in
 * Cache Storage. The workers read the files only from there.
 */

export interface HostedModel {
  /** The Hugging Face repository. */
  id: string;
  /** The commit of the files, so each device gets the same files. */
  revision: string;
  /** Each file with its size in bytes at the revision. */
  files: readonly (readonly [path: string, bytes: number])[];
  /** The Cache Storage cache that keeps the files. */
  cache: string;
}

/** The service worker's cache of the ONNX Runtime file that every model worker runs (vite.config.ts). */
export const RUNTIME_CACHE = 'vlo-onnx-runtime';

const fileUrl = (model: HostedModel, revision: string, path: string) =>
  `https://huggingface.co/${model.id}/resolve/${revision}/${path}`;

/** The cache key of a file. Transformers.js asks for each file at the "main" revision. */
export const cacheKey = (model: HostedModel, path: string) => fileUrl(model, 'main', path);

const totalOf = (model: HostedModel) => model.files.reduce((sum, [, bytes]) => sum + bytes, 0);

/** The download size, such as "249 MB". */
export const sizeOf = (model: HostedModel) => `${String(Math.round(totalOf(model) / 1_000_000))} MB`;

/** True when every file of the model is on this device. */
export async function hostedReady(model: HostedModel): Promise<boolean> {
  if (!(await caches.has(model.cache))) return false;
  const cache = await caches.open(model.cache);
  for (const [path] of model.files) if (!(await cache.match(cacheKey(model, path)))) return false;
  return true;
}

/** Downloads the files that are not on this device yet. `onProgress` gets the share done, 0 to 1. */
export async function downloadHosted(
  model: HostedModel,
  onProgress: (share: number) => void,
  signal?: AbortSignal,
): Promise<void> {
  const cache = await caches.open(model.cache);
  const total = totalOf(model);
  let done = 0;
  for (const [path, bytes] of model.files) {
    if (!(await cache.match(cacheKey(model, path)))) {
      const response = await vloFetch(fileUrl(model, model.revision, path), {
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
        onProgress((done + Math.min(got, bytes)) / total);
      }
      // A cut or changed file never goes in the cache.
      if (got !== bytes) throw new Error(`The download of ${path} was not complete.`);
      await cache.put(cacheKey(model, path), new Response(new Blob(parts as BlobPart[])));
    }
    done += bytes;
    onProgress(done / total);
  }
}
