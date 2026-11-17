/*
 * The audio worklet of live dictation (roadmap 2 F62). It mixes the microphone to mono and posts blocks
 * of 2,048 samples at the rate of the audio context, so no sample is lost between two clips.
 */

// The audio worklet scope is not in the TypeScript libraries, so this file names the two parts it uses.
declare class AudioWorkletProcessor {
  readonly port: MessagePort;
}
declare function registerProcessor(name: string, processor: new () => AudioWorkletProcessor): void;

const SIZE = 2048;

class Capture extends AudioWorkletProcessor {
  private block = new Float32Array(SIZE);
  private filled = 0;

  process(inputs: Float32Array[][]): boolean {
    const channels = inputs[0] ?? [];
    const frames = channels[0]?.length ?? 0;
    for (let i = 0; i < frames; i++) {
      let sum = 0;
      for (const channel of channels) sum += channel[i] ?? 0;
      this.block[this.filled++] = sum / channels.length;
      if (this.filled === SIZE) {
        this.port.postMessage(this.block, [this.block.buffer]);
        this.block = new Float32Array(SIZE);
        this.filled = 0;
      }
    }
    return true;
  }
}

registerProcessor('vlo-capture', Capture);
