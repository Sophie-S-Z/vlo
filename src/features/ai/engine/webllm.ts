import type { MLCEngine } from '@mlc-ai/web-llm';
import { hostAllowed, logRequest } from '@/lib/net';
import { EngineError, type Engine, type GenerateRequest } from './types';

/*
 * The in-browser engine (spec section 10, plan decisions P2 and P3): WebLLM on WebGPU, with two small
 * Apache 2.0 models. The library is its own chunk, which loads only when the writer picks this engine, and
 * it stays out of the install precache. WebLLM downloads and caches the model itself, so a performance
 * observer writes each download to the network log as a model download.
 */

export interface WebLlmModel {
  id: string;
  label: string;
  /** The download, in words. */
  download: string;
  /** Graphics memory that the model needs, in MB (from WebLLM's model list). */
  memoryMb: number;
}

export const WEBLLM_MODELS: readonly WebLlmModel[] = [
  {
    id: 'Qwen2.5-1.5B-Instruct-q4f16_1-MLC',
    label: 'Qwen2.5 1.5B',
    download: 'about 0.9 GB',
    memoryMb: 1630,
  },
  { id: 'SmolLM2-1.7B-Instruct-q4f16_1-MLC', label: 'SmolLM2 1.7B', download: 'about 1 GB', memoryMb: 1774 },
];

interface Gpu {
  requestAdapter: () => Promise<unknown>;
}

/** True when this browser can run the in-browser engine. */
export async function hasWebGpu(): Promise<boolean> {
  // Firefox and older Safari have no navigator.gpu, although the DOM types always list it.
  if (!('gpu' in navigator)) return false;
  const gpu = (navigator as Navigator & { gpu: Gpu }).gpu;
  try {
    return (await gpu.requestAdapter()) !== null;
  } catch {
    return false;
  }
}

let loaded: { model: string; engine: MLCEngine } | null = null;

/** Logs each file that WebLLM downloads while `work` runs. */
async function logDownloads<T>(work: () => Promise<T>): Promise<T> {
  const seen = (list: PerformanceObserverEntryList) => {
    for (const entry of list.getEntries() as PerformanceResourceTiming[]) {
      let url: URL;
      try {
        url = new URL(entry.name);
      } catch {
        continue;
      }
      if (!hostAllowed(url, 'model-download')) continue;
      // A file from WebLLM's cache makes no request, and the browser shows it with no bytes moved.
      if (entry.transferSize === 0 && entry.decodedBodySize > 0) continue;
      void logRequest(entry.name, 'model-download', entry.responseStatus || 200);
    }
  };
  const observer = new PerformanceObserver(seen);
  observer.observe({ type: 'resource', buffered: false });
  try {
    return await work();
  } finally {
    seen(observer.takeRecords() as unknown as PerformanceObserverEntryList);
    observer.disconnect();
  }
}

/** Loads a model (downloading it the first time) and gives its engine. */
export async function loadWebLlm(
  modelId: string,
  onProgress: (share: number, text: string) => void,
): Promise<Engine> {
  const model = WEBLLM_MODELS.find((m) => m.id === modelId);
  if (!model) throw new RangeError(`Vlo does not offer the model ${modelId}.`);
  if (!(await hasWebGpu()))
    throw new EngineError(
      'no-gpu',
      'This browser has no WebGPU, so it cannot run a model. Use a recent Chrome or Edge, or pick your own key or a server on your computer.',
    );
  if (loaded?.model !== modelId) {
    const webllm = await import('@mlc-ai/web-llm');
    const progress = (report: { progress: number; text: string }) => {
      onProgress(report.progress, report.text);
    };
    if (loaded) {
      loaded.engine.setInitProgressCallback(progress);
      await logDownloads(() => (loaded as { engine: MLCEngine }).engine.reload(modelId));
      loaded = { model: modelId, engine: loaded.engine };
    } else {
      const engine = await logDownloads(() =>
        webllm.CreateMLCEngine(modelId, { initProgressCallback: progress }),
      );
      loaded = { model: modelId, engine };
    }
  }
  const engine = loaded.engine;
  return {
    id: 'webllm',
    label: 'In this browser',
    host: 'this browser',
    model: model.label,
    async *generate(request: GenerateRequest) {
      const stop = () => {
        void engine.interruptGenerate();
      };
      request.signal?.addEventListener('abort', stop, { once: true });
      try {
        const chunks = await engine.chat.completions.create({
          stream: true,
          max_tokens: request.maxTokens,
          messages: [{ role: 'system', content: request.system }, ...request.messages],
        });
        for await (const chunk of chunks) {
          if (request.signal?.aborted) return;
          const piece = chunk.choices[0]?.delta.content;
          if (piece) yield piece;
        }
      } finally {
        request.signal?.removeEventListener('abort', stop);
      }
    },
  };
}

/** Frees the model's graphics memory, as when the project goes back to Pen mode. */
export async function unloadWebLlm(): Promise<void> {
  const current = loaded;
  loaded = null;
  await current?.engine.unload();
}
