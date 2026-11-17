import { env } from '@huggingface/transformers';
import ortWasm from 'onnxruntime-web/ort-wasm-simd-threaded.asyncify.wasm?url';

/*
 * The setup that the speech worker and the voice worker share. Transformers.js reads a model only from
 * the Cache Storage cache where `downloadHosted` put it: its fetch refuses every request. The ONNX Runtime
 * WASM file comes from Vlo's own host. So a worker makes no request that leaves the app.
 */

/** Sets Transformers.js to read only from `cache`. `missing` is the error for a file that is not there. */
export function readOnlyFrom(cache: string, missing: string): void {
  env.allowLocalModels = false;
  // A file that is not in the cache fails here. Transformers.js has no switch for "the cache only".
  // eslint-disable-next-line no-restricted-properties -- This fetch refuses every request, so none goes.
  env.fetch = () => Promise.reject(new Error(missing));
  env.useBrowserCache = true;
  env.cacheKey = cache;
  env.useWasmCache = false;
  // The runtime's code is in the bundle. Its WASM file comes from Vlo's host, not from a CDN.
  if (env.backends.onnx.wasm) env.backends.onnx.wasm.wasmPaths = { wasm: ortWasm };
}

/** WebGPU when the device has a GPU adapter for it, else WASM. */
export async function device(): Promise<'webgpu' | 'wasm'> {
  // Firefox and older Safari have no navigator.gpu, although the types always list it.
  if (!('gpu' in navigator)) return 'wasm';
  try {
    return (await navigator.gpu.requestAdapter()) ? 'webgpu' : 'wasm';
  } catch {
    return 'wasm';
  }
}
