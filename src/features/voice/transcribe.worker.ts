/// <reference lib="webworker" />
import { env, pipeline, type AutomaticSpeechRecognitionPipeline } from '@huggingface/transformers';
import ortWasm from 'onnxruntime-web/ort-wasm-simd-threaded.asyncify.wasm?url';
import { MODEL_CACHE, MODEL_ID } from './model';

/*
 * Speech to text off the main thread (roadmap F57, plan Task K9). Transformers.js reads the model only
 * from Cache Storage, where `downloadModel` put it: its fetch refuses every request. The ONNX Runtime WASM
 * file comes from Vlo's own host. So this worker makes no request that leaves the app. It runs on WebGPU,
 * or on WASM when the device has no WebGPU.
 */

export interface TranscribeRequest {
  id: number;
  /** Mono samples at 16 kHz. */
  samples: Float32Array;
  /** A Whisper language code, such as "en". With none, Whisper takes English. */
  language?: string;
}

export type TranscribeResponse = { id: number; text: string } | { id: number; error: string };

declare const self: DedicatedWorkerGlobalScope;

env.allowLocalModels = false;
// A file that is not in the cache fails here. Transformers.js has no switch for "the cache only".
// eslint-disable-next-line no-restricted-properties -- This fetch refuses every request, so none goes.
env.fetch = () => Promise.reject(new Error('The speech model is not on this device.'));
env.useBrowserCache = true;
env.cacheKey = MODEL_CACHE;
env.useWasmCache = false;
// The runtime's code is in the bundle. Its WASM file comes from Vlo's host, not from a CDN.
if (env.backends.onnx.wasm) env.backends.onnx.wasm.wasmPaths = { wasm: ortWasm };

let model: Promise<AutomaticSpeechRecognitionPipeline> | null = null;

/** WebGPU when the device has a GPU adapter for it, else WASM. */
async function device(): Promise<'webgpu' | 'wasm'> {
  // Firefox and older Safari have no navigator.gpu, although the types always list it.
  if (!('gpu' in navigator)) return 'wasm';
  try {
    return (await navigator.gpu.requestAdapter()) ? 'webgpu' : 'wasm';
  } catch {
    return 'wasm';
  }
}

async function load(): Promise<AutomaticSpeechRecognitionPipeline> {
  return pipeline('automatic-speech-recognition', MODEL_ID, { dtype: 'q8', device: await device() });
}

self.onmessage = (event: MessageEvent<TranscribeRequest>) => {
  const { id, samples, language } = event.data;
  model ??= load();
  model
    .then((asr) =>
      asr(samples, {
        task: 'transcribe',
        ...(language ? { language } : {}),
        // A long answer goes in 30-second parts that overlap, as Whisper hears 30 seconds at a time.
        chunk_length_s: 30,
        stride_length_s: 5,
      }),
    )
    .then(
      (output) => {
        const parts: readonly { text: string }[] = Array.isArray(output) ? output : [output];
        self.postMessage({
          id,
          text: parts
            .map((part) => part.text.trim())
            .join(' ')
            .trim(),
        } satisfies TranscribeResponse);
      },
      (problem: unknown) => {
        // After a failed load, Transformers.js fails each later load too, so the page starts a new worker.
        self.postMessage({ id, error: String(problem) } satisfies TranscribeResponse);
      },
    );
};
