/*
 * Live dictation (roadmap 2 F62) cuts the writer's speech into clips at pauses, so the words of a clip go
 * in while the writer speaks on. Whisper hears at most 30 seconds at a time, so a clip with no pause stops
 * at the quietest moment of its last seconds. A clip with no speech goes nowhere, as Whisper invents words
 * for silence.
 */

/** The loudness, as the root mean square of the samples, at which a block counts as speech. */
export const SPEECH_LEVEL = 0.015;
/** The seconds of silence that end a clip. */
export const PAUSE_SECONDS = 0.6;
/** The seconds of speech that a clip needs. */
export const MIN_SPEECH_SECONDS = 0.3;
/** The longest clip, in seconds. */
export const MAX_CLIP_SECONDS = 28;
/** A clip at the longest stops at the quietest block of its last seconds. */
const LOOK_BACK_SECONDS = 4;
/** The silence that stays before the first word of a clip. */
const LEAD_SECONDS = 0.3;

interface Block {
  samples: Float32Array;
  rms: number;
  speech: boolean;
}

export function rmsOf(samples: Float32Array): number {
  let sum = 0;
  for (const s of samples) sum += s * s;
  return samples.length === 0 ? 0 : Math.sqrt(sum / samples.length);
}

function joined(blocks: readonly Block[]): Float32Array {
  const out = new Float32Array(blocks.reduce((n, b) => n + b.samples.length, 0));
  let at = 0;
  for (const b of blocks) {
    out.set(b.samples, at);
    at += b.samples.length;
  }
  return out;
}

/** Collects the blocks of audio at `rate` and gives each clip to `emit`. */
export class Segmenter {
  private blocks: Block[] = [];
  private readonly rate: number;
  private readonly emit: (clip: Float32Array) => void;

  constructor(rate: number, emit: (clip: Float32Array) => void) {
    this.rate = rate;
    this.emit = emit;
  }

  private seconds(blocks: readonly Block[], speechOnly = false): number {
    let n = 0;
    for (const b of blocks) if (!speechOnly || b.speech) n += b.samples.length;
    return n / this.rate;
  }

  /** The seconds of silence at the end of the clip. */
  private silence(): number {
    let n = 0;
    for (let i = this.blocks.length - 1; i >= 0 && !this.blocks[i]?.speech; i--)
      n += this.blocks[i]?.samples.length ?? 0;
    return n / this.rate;
  }

  /** Gives the first `count` blocks as a clip when they hold speech, and keeps the rest. */
  private cut(count: number): void {
    const head = this.blocks.slice(0, count);
    this.blocks = this.blocks.slice(count);
    if (this.seconds(head, true) >= MIN_SPEECH_SECONDS) this.emit(joined(head));
  }

  /**
   * Adds a block. `busy` is true while an earlier clip turns into text: a pause then does not end the clip,
   * so a slow device gets fewer, longer clips and does not fall behind.
   */
  push(samples: Float32Array, busy: boolean): void {
    const rms = rmsOf(samples);
    this.blocks.push({ samples, rms, speech: rms >= SPEECH_LEVEL });
    if (this.seconds(this.blocks, true) === 0) {
      // No speech yet: only the lead-in silence stays.
      while (this.blocks.length > 1 && this.seconds(this.blocks.slice(1)) >= LEAD_SECONDS)
        this.blocks.shift();
      return;
    }
    if (!busy && this.silence() >= PAUSE_SECONDS && this.seconds(this.blocks, true) >= MIN_SPEECH_SECONDS) {
      this.cut(this.blocks.length);
      return;
    }
    if (this.seconds(this.blocks) < MAX_CLIP_SECONDS) return;
    // The clip ends after its quietest block of the last seconds, so no word splits in two.
    let quietest = this.blocks.length - 1;
    let back = 0;
    for (let i = this.blocks.length - 1; i > 0 && back < LOOK_BACK_SECONDS; i--) {
      const block = this.blocks[i];
      if (!block) break;
      back += block.samples.length / this.rate;
      if (block.rms < (this.blocks[quietest]?.rms ?? Infinity)) quietest = i;
    }
    this.cut(quietest + 1);
  }

  /** Gives the rest as a last clip when it holds speech. */
  flush(): void {
    this.cut(this.blocks.length);
  }
}
