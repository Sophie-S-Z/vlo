/// <reference lib="webworker" />
import { pipeline, type TextToAudioPipeline } from '@huggingface/transformers';
import { cacheKey } from './hosted';
import { NATURAL_VOICES, speechParts, VOICE_CACHE, type NaturalVoiceId } from './natural';
import { device, readOnlyFrom } from './onDevice';

/*
 * The natural voices off the main thread. The worker reads Supertonic 2 only from Cache Storage, and it
 * runs on WebGPU, or on WASM when the device has no WebGPU.
 */

export interface SpeakRequest {
  type: 'speak';
  id: number;
  text: string;
  voice: NaturalVoiceId;
  /** The model's speed, where 1 is its own pace. */
  speed: number;
  /** The model's language tag, such as "en". */
  language: string;
}

/** Drops each request with a lower id that waits, as the reading stopped. */
export interface SkipRequest {
  type: 'skip';
  below: number;
}

export type SpeakResponse =
  { id: number; samples: Float32Array; rate: number } | { id: number; error: string };

declare const self: DedicatedWorkerGlobalScope;

readOnlyFrom(VOICE_CACHE, 'The natural voices are not on this device.');

/** The steps of the model. More steps sound smoother and take longer; 8 runs faster than speech on WASM. */
const STEPS = 8;
/** The silence between two parts of a long sentence, in seconds. */
const GAP = 0.15;
/** A part that ends with no stop gets one, as the model ends a part well only after one. */
const ENDS = /[.!?;:,'"’”)\]}…»]$/u;

let model: Promise<TextToAudioPipeline> | null = null;
const styles = new Map<NaturalVoiceId, Promise<Float32Array>>();

async function load(): Promise<TextToAudioPipeline> {
  return pipeline('text-to-speech', NATURAL_VOICES.id, { dtype: 'fp32', device: await device() });
}

/** The style of a voice, from the cache only. */
function styleOf(voice: NaturalVoiceId): Promise<Float32Array> {
  let style = styles.get(voice);
  if (!style) {
    style = caches
      .open(VOICE_CACHE)
      .then((cache) => cache.match(cacheKey(NATURAL_VOICES, `voices/${voice}.bin`)))
      .then(async (response) => {
        if (!response) throw new Error('The natural voices are not on this device.');
        return new Float32Array(await response.arrayBuffer());
      });
    styles.set(voice, style);
    style.catch(() => styles.delete(voice));
  }
  return style;
}

async function speak({ text, voice, speed, language }: SpeakRequest) {
  model ??= load();
  const [tts, style] = await Promise.all([model, styleOf(voice)]);
  const parts: Float32Array[] = [];
  let rate = 44_100;
  for (const part of speechParts(text)) {
    const said = ENDS.test(part) ? part : `${part}.`;
    const audio = await tts(`<${language}>${said}</${language}>`, {
      speaker_embeddings: style,
      num_inference_steps: STEPS,
      speed,
    });
    rate = audio.sampling_rate;
    if (parts.length > 0) parts.push(new Float32Array(Math.round(GAP * rate)));
    parts.push(audio.data);
  }
  const samples = new Float32Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    samples.set(p, at);
    at += p.length;
  }
  return { samples, rate };
}

// One sentence at a time, in the order asked, so the next sentence is ready when this one ends.
let queue = Promise.resolve();
let skipBelow = 0;

self.onmessage = (event: MessageEvent<SpeakRequest | SkipRequest>) => {
  const request = event.data;
  if (request.type === 'skip') {
    skipBelow = Math.max(skipBelow, request.below);
    return;
  }
  queue = queue.then(() => {
    if (request.id < skipBelow) {
      self.postMessage({ id: request.id, error: 'Skipped.' } satisfies SpeakResponse);
      return;
    }
    return speak(request).then(
      ({ samples, rate }) => {
        self.postMessage({ id: request.id, samples, rate } satisfies SpeakResponse, [samples.buffer]);
      },
      (problem: unknown) => {
        // After a failed load, Transformers.js fails each later load too, so the page starts a new worker.
        model = null;
        self.postMessage({ id: request.id, error: String(problem) } satisfies SpeakResponse);
      },
    );
  });
};
