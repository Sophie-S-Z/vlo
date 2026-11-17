import captureUrl from './capture.worklet.ts?worker&url';
import { RATE } from './speech';
import { rmsOf, Segmenter } from './segments';

/*
 * Live dictation (roadmap 2 F62): the microphone goes to an audio worklet, and the segmenter cuts the
 * speech into clips at pauses. The audio stays on this device, in memory only.
 */

export interface Listening {
  /** The loudness now, from 0 to 1, for the level meter. */
  level: () => number;
  /** Ends the listening. It resolves after the last clip is written, or rejects when a clip failed. */
  stop: () => Promise<void>;
}

/** The samples of a clip at 16 kHz, the input of Whisper. */
async function at16k(samples: Float32Array, rate: number): Promise<Float32Array> {
  if (rate === RATE) return samples;
  const context = new OfflineAudioContext(1, Math.ceil((samples.length * RATE) / rate), RATE);
  const buffer = context.createBuffer(1, samples.length, rate);
  buffer.copyToChannel(samples as Float32Array<ArrayBuffer>, 0);
  const source = context.createBufferSource();
  source.buffer = buffer;
  source.connect(context.destination);
  source.start();
  return (await context.startRendering()).getChannelData(0);
}

/**
 * Starts to listen. The browser asks the writer for the microphone the first time. `write` gets each clip
 * as samples at 16 kHz, one at a time and in the order of speech.
 */
export async function startListening(write: (samples: Float32Array) => Promise<void>): Promise<Listening> {
  // The browser's echo and noise filters give Whisper cleaner speech.
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
  });
  const context = new AudioContext();
  try {
    await context.audioWorklet.addModule(captureUrl);
  } catch (problem) {
    for (const track of stream.getTracks()) track.stop();
    void context.close();
    throw problem;
  }
  const rate = context.sampleRate;
  const node = new AudioWorkletNode(context, 'vlo-capture');
  context.createMediaStreamSource(stream).connect(node);
  // The node writes no sound. The link to the speakers only keeps it running in every browser.
  node.connect(context.destination);
  // The clips that are not written yet. After a clip fails, Vlo writes no more clips.
  let waiting = 0;
  let failed: { problem: unknown } | null = null;
  let order = Promise.resolve();
  const segmenter = new Segmenter(rate, (clip) => {
    waiting += 1;
    const ready = at16k(clip, rate);
    order = order
      .then(async () => {
        const samples = await ready;
        if (!failed) await write(samples);
      })
      .catch((problem: unknown) => {
        failed ??= { problem };
      })
      .finally(() => {
        waiting -= 1;
      });
  });
  let level = 0;
  node.port.onmessage = (event: MessageEvent<Float32Array>) => {
    level = Math.min(1, rmsOf(event.data) * 4);
    segmenter.push(event.data, waiting > 0);
  };
  return {
    level: () => level,
    stop: async () => {
      node.port.onmessage = null;
      for (const track of stream.getTracks()) track.stop();
      void context.close();
      segmenter.flush();
      await order;
      if (failed) throw failed.problem;
    },
  };
}
