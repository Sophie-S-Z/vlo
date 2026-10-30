/** Web Audio engine (spec 18.1 item 10). Everything is generated; no audio files load. */
export interface Engine {
  start: () => Promise<void>;
  stop: () => void;
  /** A soft UI tick, for hover on links and buttons. */
  tick: () => void;
  /** A paper sound, for a successful sign-up. */
  paper: () => void;
  /** The current output level, 0 to 1. */
  level: () => number;
}

const ROOM_GAIN = 0.018;

function noiseBuffer(context: AudioContext, seconds: number): AudioBuffer {
  const buffer = context.createBuffer(
    1,
    Math.ceil(context.sampleRate * seconds),
    context.sampleRate,
  );
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  return buffer;
}

export function createEngine(): Engine {
  let context: AudioContext | undefined;
  let master: GainNode | undefined;
  let analyser: AnalyserNode | undefined;
  let room: AudioBufferSourceNode | undefined;
  let samples: Uint8Array<ArrayBuffer> | undefined;
  let stopHover: (() => void) | undefined;

  const tick = () => {
    if (!context || !master) return;
    const now = context.currentTime;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.frequency.value = 1800;
    gain.gain.setValueAtTime(0.03, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.03);
    oscillator.connect(gain).connect(master);
    oscillator.start(now);
    oscillator.stop(now + 0.04);
  };

  return {
    async start() {
      context ??= new AudioContext();
      await context.resume();
      master = context.createGain();
      master.gain.value = 0.8;
      analyser = context.createAnalyser();
      analyser.fftSize = 256;
      samples = new Uint8Array(new ArrayBuffer(analyser.fftSize));
      master.connect(analyser).connect(context.destination);

      // Soft room tone: looped noise through a low-pass filter, faded in.
      room = context.createBufferSource();
      room.buffer = noiseBuffer(context, 2);
      room.loop = true;
      const filter = context.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = 380;
      const gain = context.createGain();
      gain.gain.setValueAtTime(0, context.currentTime);
      gain.gain.linearRampToValueAtTime(ROOM_GAIN, context.currentTime + 1.5);
      room.connect(filter).connect(gain).connect(master);
      room.start();

      if (matchMedia("(pointer: fine)").matches) {
        const onOver = (event: PointerEvent) => {
          const target = (event.target as Element).closest?.("a, button, [role=switch]");
          const from = (event.relatedTarget as Element | null)?.closest?.(
            "a, button, [role=switch]",
          );
          if (target && target !== from) tick();
        };
        document.addEventListener("pointerover", onOver);
        stopHover = () => document.removeEventListener("pointerover", onOver);
      }
    },
    stop() {
      stopHover?.();
      stopHover = undefined;
      room?.stop();
      room = undefined;
      void context?.close();
      context = undefined;
      master = undefined;
      analyser = undefined;
    },
    tick,
    paper() {
      if (!context || !master) return;
      const now = context.currentTime;
      const source = context.createBufferSource();
      source.buffer = noiseBuffer(context, 0.4);
      const band = context.createBiquadFilter();
      band.type = "bandpass";
      band.frequency.setValueAtTime(3200, now);
      band.frequency.exponentialRampToValueAtTime(1400, now + 0.35);
      band.Q.value = 0.8;
      const gain = context.createGain();
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.12, now + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.38);
      source.connect(band).connect(gain).connect(master);
      source.start(now);
    },
    level() {
      if (!analyser || !samples) return 0;
      analyser.getByteTimeDomainData(samples);
      let peak = 0;
      for (const value of samples) peak = Math.max(peak, Math.abs(value - 128));
      return Math.min(1, peak / 40);
    },
  };
}
