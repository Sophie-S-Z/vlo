import type { NaturalVoiceId } from './natural';
import type { SkipRequest, SpeakRequest, SpeakResponse } from './speak.worker';

/*
 * The page side of the natural voices: the worker makes the audio of a sentence, and an audio context
 * plays it. The context starts in the writer's click, so every browser lets it play.
 */

export interface NaturalAudio {
  samples: Float32Array;
  rate: number;
}

let worker: Worker | null = null;
let nextId = 0;
const waiting = new Map<
  number,
  { resolve: (audio: NaturalAudio) => void; reject: (problem: Error) => void }
>();

/** Ends the worker and rejects each sentence that it has not made. The next sentence gets a new worker. */
function endWorker(made: Worker, problem: Error): void {
  made.terminate();
  if (worker !== made) return;
  worker = null;
  for (const job of waiting.values()) job.reject(problem);
  waiting.clear();
}

function voiceWorker(): Worker {
  if (worker) return worker;
  const made = new Worker(new URL('./speak.worker.ts', import.meta.url), { type: 'module' });
  made.onmessage = (event: MessageEvent<SpeakResponse>) => {
    const reply = event.data;
    const job = waiting.get(reply.id);
    waiting.delete(reply.id);
    if ('samples' in reply) {
      job?.resolve({ samples: reply.samples, rate: reply.rate });
      return;
    }
    job?.reject(new Error(reply.error));
    // After a failed load, Transformers.js fails each later load in the same worker. A skip is no failure.
    if (reply.error !== 'Skipped.') endWorker(made, new Error(reply.error));
  };
  made.onerror = () => {
    endWorker(made, new Error('The voice worker stopped.'));
  };
  worker = made;
  return made;
}

/** The audio of `text` in a natural voice. `speed` is the model's, where 1 is its own pace. */
export function naturalAudio(
  text: string,
  voice: NaturalVoiceId,
  speed: number,
  language: string,
): Promise<NaturalAudio> {
  const request: SpeakRequest = { type: 'speak', id: nextId++, text, voice, speed, language };
  return new Promise((resolve, reject) => {
    waiting.set(request.id, { resolve, reject });
    voiceWorker().postMessage(request);
  });
}

/** Drops the audio that the worker has not made yet, as the reading stopped. */
export function forgetAudio(): void {
  if (!worker) return;
  worker.postMessage({ type: 'skip', below: nextId } satisfies SkipRequest);
  for (const job of waiting.values()) job.reject(new Error('Skipped.'));
  waiting.clear();
}

let context: AudioContext | null = null;
let playing: AudioBufferSourceNode | null = null;

/** Starts or wakes the audio context. Call it from the writer's click or key. */
export function unlockAudio(): void {
  if (typeof AudioContext === 'undefined') return;
  context ??= new AudioContext();
  void context.resume();
}

/** Plays `audio`, and `onEnd` runs when it ends by itself. A new play or a stop ends the one before. */
export function playAudio(audio: NaturalAudio, onEnd: () => void): void {
  stopAudio();
  if (!context) {
    onEnd();
    return;
  }
  const buffer = new AudioBuffer({ length: audio.samples.length, sampleRate: audio.rate });
  buffer.copyToChannel(audio.samples as Float32Array<ArrayBuffer>, 0);
  const source = context.createBufferSource();
  source.buffer = buffer;
  source.connect(context.destination);
  source.onended = () => {
    if (playing !== source) return;
    playing = null;
    onEnd();
  };
  playing = source;
  source.start();
}

export function stopAudio(): void {
  const source = playing;
  playing = null;
  source?.stop();
}
