import type { LogitProcessor, MLCEngine } from '@mlc-ai/web-llm';
import type { Scorer } from '@/features/analysis/deep/run';
import { tokenStat, type TokenStat } from '@/features/analysis/deep/score';
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
/** Counts each unload, so a load that ends after an unload frees its model at once. */
let generation = 0;

/** The error that a load gives when an unload or a cancel came first. */
export const LOAD_CANCELLED = 'Vlo stopped loading the model.';

/** Logs each file that WebLLM downloads while `work` runs. */
async function logDownloads<T>(work: () => Promise<T>): Promise<T> {
  const seen = (entries: readonly PerformanceEntry[]) => {
    for (const entry of entries as readonly PerformanceResourceTiming[]) {
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
  const observer = new PerformanceObserver((list) => {
    seen(list.getEntries());
  });
  observer.observe({ type: 'resource', buffered: false });
  try {
    return await work();
  } finally {
    // takeRecords gives the entries themselves, which the callback has not seen yet.
    seen(observer.takeRecords());
    observer.disconnect();
  }
}

/** True while the deep check reads a text, and the count of co-writer answers that run now. */
let scoring = false;
let generating = 0;

/** Loads a model (downloading it the first time) and gives the library's engine. */
async function engineFor(
  modelId: string,
  onProgress: (share: number, text: string) => void,
): Promise<{ model: WebLlmModel; engine: MLCEngine }> {
  const model = WEBLLM_MODELS.find((m) => m.id === modelId);
  if (!model) throw new RangeError(`Vlo does not offer the model ${modelId}.`);
  if (!(await hasWebGpu()))
    throw new EngineError(
      'no-gpu',
      'This browser has no WebGPU, so it cannot run a model. Use a recent Chrome or Edge, or pick your own key or a server on your computer.',
    );
  if (loaded?.model !== modelId) {
    const started = generation;
    const webllm = await import('@mlc-ai/web-llm');
    if (started !== generation) throw new EngineError('cancelled', LOAD_CANCELLED);
    const progress = (report: { progress: number; text: string }) => {
      onProgress(report.progress, report.text);
    };
    if (loaded) {
      const engine = loaded.engine;
      // No caller may use the engine while it reloads.
      loaded = null;
      engine.setInitProgressCallback(progress);
      try {
        await logDownloads(() => engine.reload(modelId));
      } catch (problem) {
        await engine.unload().catch(() => undefined);
        throw problem;
      }
      if (started !== generation) {
        await engine.unload();
        throw new EngineError('cancelled', LOAD_CANCELLED);
      }
      loaded = { model: modelId, engine };
    } else {
      const engine = await logDownloads(() =>
        webllm.CreateMLCEngine(modelId, { initProgressCallback: progress }),
      );
      // WebLLM cannot stop a download in the middle of a file, so a cancelled load frees its model here.
      if (started !== generation) {
        await engine.unload();
        throw new EngineError('cancelled', LOAD_CANCELLED);
      }
      loaded = { model: modelId, engine };
    }
  }
  return { model, engine: loaded.engine };
}

/** Loads a model (downloading it the first time) and gives its engine. */
export async function loadWebLlm(
  modelId: string,
  onProgress: (share: number, text: string) => void,
): Promise<Engine> {
  const { model, engine } = await engineFor(modelId, onProgress);
  return {
    id: 'webllm',
    label: 'In this browser',
    host: 'this browser',
    model: model.label,
    async *generate(request: GenerateRequest) {
      const stop = () => {
        void engine.interruptGenerate();
      };
      if (scoring)
        throw new EngineError(
          'server',
          'The deep AI check is using the model. Wait for it to end, or stop it.',
        );
      generating += 1;
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
        generating -= 1;
        request.signal?.removeEventListener('abort', stop);
      }
    },
  };
}

/**
 * The parts of WebLLM's model pipeline that the deep check needs. WebLLM 0.2.87 has no public call for the
 * tokenizer or for the logits of a given text, so the check uses two fields of the pipeline. The version is
 * pinned, and tests/unit/deep-webllm.test.ts checks that the library still has these fields.
 */
interface PipelineFields {
  tokenizer: { encode: (text: string) => ArrayLike<number> };
  logitProcessor?: LogitProcessor | undefined;
}

function pipelineOf(engine: MLCEngine, modelId: string): PipelineFields {
  const map = (engine as unknown as { loadedModelIdToPipeline?: unknown }).loadedModelIdToPipeline;
  const pipeline: unknown = map instanceof Map ? map.get(modelId) : undefined;
  const tokenizer = (pipeline as { tokenizer?: { encode?: unknown } } | undefined)?.tokenizer;
  if (typeof tokenizer?.encode !== 'function')
    throw new EngineError('server', 'This version of the in-browser engine cannot run the deep AI check.');
  return pipeline as PipelineFields;
}

/** Loads a model for the deep AI check, which reads a text and scores each token. */
export async function loadWebLlmScorer(
  modelId: string,
  onProgress: (share: number, text: string) => void,
): Promise<Scorer> {
  const { model, engine } = await engineFor(modelId, onProgress);
  const pipeline = pipelineOf(engine, modelId);
  return {
    model: modelId,
    label: model.label,
    tokenize: (text) => Array.from(pipeline.tokenizer.encode(text)),
    async read(ids, signal, onStep) {
      if (generating > 0)
        throw new EngineError(
          'server',
          'The co-writer is using the model. Wait for it to end, then try again.',
        );
      if (scoring) throw new EngineError('server', 'The deep AI check is already running.');
      scoring = true;
      const before = pipeline.logitProcessor;
      const stats: TokenStat[] = [];
      let target = -1;
      // The logits of each step pass through unchanged. The check only reads them.
      pipeline.logitProcessor = {
        processLogits: (logits) => {
          if (target >= 0) stats.push(tokenStat(logits, target));
          return logits;
        },
        processSampledToken: () => undefined,
        resetState: () => undefined,
      };
      try {
        await engine.resetChat(false, modelId);
        for (let i = 0; i + 1 < ids.length; i += 1) {
          if (signal.aborted) throw new DOMException('The deep check stopped.', 'AbortError');
          target = ids[i + 1] ?? -1;
          await engine.forwardTokensAndSample([ids[i] ?? 0], i === 0, modelId);
          onStep();
        }
      } finally {
        target = -1;
        pipeline.logitProcessor = before;
        scoring = false;
        await engine.resetChat(false, modelId).catch(() => undefined);
      }
      return stats;
    },
  };
}

/** Stops a load that runs now. Its model is freed when its download ends, and no request uses it. */
export function cancelWebLlmLoad(): void {
  generation += 1;
}

/** Frees the model's graphics memory, as when the project goes back to Pen mode. */
export async function unloadWebLlm(): Promise<void> {
  generation += 1;
  const current = loaded;
  loaded = null;
  await current?.engine.unload();
}
