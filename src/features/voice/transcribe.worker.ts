/// <reference lib="webworker" />
import { pipeline, type AutomaticSpeechRecognitionPipeline } from '@huggingface/transformers';
import { MODEL_CACHE } from './model';
import { device, readOnlyFrom } from './onDevice';

/*
 * Speech to text off the main thread (roadmap F57, plan Task K9). The worker reads the Whisper model only
 * from Cache Storage, and it runs on WebGPU, or on WASM when the device has no WebGPU.
 */

export interface TranscribeRequest {
  id: number;
  /** The Hugging Face repository of the model, from SPEECH_MODELS. */
  model: string;
  /** Mono samples at 16 kHz. */
  samples: Float32Array;
  /** A Whisper language code, such as "en". With none, Whisper takes English. */
  language?: string;
}

export type TranscribeResponse = { id: number; text: string } | { id: number; error: string };

declare const self: DedicatedWorkerGlobalScope;

readOnlyFrom(MODEL_CACHE, 'The speech model is not on this device.');

/** The model that the worker holds. A change of model frees the old one. */
let loaded: { model: string; asr: Promise<AutomaticSpeechRecognitionPipeline> } | null = null;

async function load(model: string): Promise<AutomaticSpeechRecognitionPipeline> {
  return pipeline('automatic-speech-recognition', model, { dtype: 'q8', device: await device() });
}

function asrFor(model: string): Promise<AutomaticSpeechRecognitionPipeline> {
  if (loaded?.model !== model) {
    void loaded?.asr.then((old) => old.dispose()).catch(() => undefined);
    loaded = { model, asr: load(model) };
  }
  return loaded.asr;
}

self.onmessage = (event: MessageEvent<TranscribeRequest>) => {
  const { id, model, samples, language } = event.data;
  asrFor(model)
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
