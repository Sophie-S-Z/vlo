import { NATURE, type MoodId, type NatureId, type NatureMix } from './mix';
import { frequency, MOODS, stepEvents, stepSeconds, STEPS_PER_BAR, swingDelay, type Mood } from './music';

/*
 * The Web Audio sound engine (plan Task A9). It loads the first time the writer presses Play or turns on
 * key sounds. Every sound is made here from noise and oscillators: no recording, no request. A scheduler
 * looks a short time ahead and queues each drop, crackle, chirp and note on the audio clock.
 */

type Out = AudioNode;

/** How far ahead the scheduler queues sound. A hidden tab runs its timers about once a second. */
function lookahead(): number {
  return typeof document !== 'undefined' && document.hidden ? 1.6 : 0.25;
}

const TICK_MS = 60;

/** A small random source for the engine. Sound does not need to repeat, so it uses Math.random. */
const rand = (min: number, max: number) => min + Math.random() * (max - min);

type NoiseColor = 'white' | 'pink' | 'brown';

function noiseBuffer(ctx: BaseAudioContext, color: NoiseColor, seconds = 4): AudioBuffer {
  const length = Math.floor(ctx.sampleRate * seconds);
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  // Pink noise by Paul Kellet's filter; brown noise by a leaky sum of white noise.
  let b0 = 0;
  let b1 = 0;
  let b2 = 0;
  let b3 = 0;
  let b4 = 0;
  let b5 = 0;
  let b6 = 0;
  let last = 0;
  for (let i = 0; i < length; i++) {
    const white = Math.random() * 2 - 1;
    if (color === 'white') data[i] = white * 0.5;
    else if (color === 'pink') {
      b0 = 0.99886 * b0 + white * 0.0555179;
      b1 = 0.99332 * b1 + white * 0.0750759;
      b2 = 0.969 * b2 + white * 0.153852;
      b3 = 0.8665 * b3 + white * 0.3104856;
      b4 = 0.55 * b4 + white * 0.5329522;
      b5 = -0.7616 * b5 - white * 0.016898;
      data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11;
      b6 = white * 0.115926;
    } else {
      last = (last + 0.02 * white) / 1.02;
      data[i] = last * 3.5;
    }
  }
  return buffer;
}

/** A room echo: stereo noise that dies away over `seconds`. */
function roomImpulse(ctx: BaseAudioContext, seconds: number): AudioBuffer {
  const length = Math.floor(ctx.sampleRate * seconds);
  const buffer = ctx.createBuffer(2, length, ctx.sampleRate);
  for (let channel = 0; channel < 2; channel++) {
    const data = buffer.getChannelData(channel);
    for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / length) ** 3;
  }
  return buffer;
}

/** Vinyl crackle: sparse clicks of random size over a faint hiss. */
function crackleBuffer(ctx: BaseAudioContext, seconds = 6): AudioBuffer {
  const length = Math.floor(ctx.sampleRate * seconds);
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) {
    data[i] = (Math.random() * 2 - 1) * 0.015;
    if (Math.random() < 0.00035) {
      const size = Math.random() ** 3;
      const span = Math.floor(rand(8, 60));
      for (let j = 0; j < span && i + j < length; j++) {
        data[i + j] = (data[i + j] ?? 0) + (Math.random() * 2 - 1) * size * (1 - j / span);
      }
    }
  }
  return buffer;
}

function connectChain(...nodes: AudioNode[]): void {
  for (let i = 0; i < nodes.length - 1; i++) {
    const from = nodes[i];
    const to = nodes[i + 1];
    if (from && to) from.connect(to);
  }
}

function filter(ctx: BaseAudioContext, type: BiquadFilterType, freq: number, q = 0.7): BiquadFilterNode {
  const node = ctx.createBiquadFilter();
  node.type = type;
  node.frequency.value = freq;
  node.Q.value = q;
  return node;
}

function gainNode(ctx: BaseAudioContext, value: number): GainNode {
  const node = ctx.createGain();
  node.gain.value = value;
  return node;
}

function panNode(ctx: BaseAudioContext, value: number): AudioNode {
  if (typeof ctx.createStereoPanner !== 'function') return ctx.createGain();
  const node = ctx.createStereoPanner();
  node.pan.value = value;
  return node;
}

/** Disconnects a short sound's nodes once it ends, so they can go. */
function release(source: AudioScheduledSourceNode, ...nodes: AudioNode[]): void {
  source.onended = () => {
    source.disconnect();
    for (const node of nodes) node.disconnect();
  };
}

/** A short burst of noise through a filter, such as a rain drop, a crackle or a hi-hat. */
function burst(
  engine: SoundEngine,
  out: Out,
  at: number,
  opts: { type: BiquadFilterType; freq: number; q?: number; peak: number; decay: number; pan?: number },
): void {
  const { ctx } = engine;
  const source = ctx.createBufferSource();
  source.buffer = engine.noise.white;
  const shape = filter(ctx, opts.type, opts.freq, opts.q ?? 0.7);
  const env = gainNode(ctx, 0);
  const pan = panNode(ctx, opts.pan ?? 0);
  connectChain(source, shape, env, pan, out);
  env.gain.setValueAtTime(0, at);
  env.gain.linearRampToValueAtTime(opts.peak, at + 0.002);
  env.gain.setTargetAtTime(0, at + 0.002, opts.decay / 3);
  source.start(at, Math.random() * 3);
  source.stop(at + opts.decay * 2 + 0.05);
  release(source, shape, env, pan);
}

/** A tone with a quick attack and a soft fall, such as a chirp, a clink or a note. */
function tone(
  engine: SoundEngine,
  out: Out,
  at: number,
  opts: {
    type?: OscillatorType;
    freq: number;
    to?: number;
    glide?: number;
    peak: number;
    attack?: number;
    hold?: number;
    decay: number;
    pan?: number;
    detune?: number;
  },
): void {
  const { ctx } = engine;
  const osc = ctx.createOscillator();
  osc.type = opts.type ?? 'sine';
  osc.frequency.setValueAtTime(opts.freq, at);
  if (opts.detune) osc.detune.value = opts.detune;
  if (opts.to !== undefined) {
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, opts.to), at + (opts.glide ?? 0.1));
  }
  const env = gainNode(ctx, 0);
  const pan = panNode(ctx, opts.pan ?? 0);
  connectChain(osc, env, pan, out);
  const attack = opts.attack ?? 0.005;
  const hold = opts.hold ?? 0;
  env.gain.setValueAtTime(0, at);
  env.gain.linearRampToValueAtTime(opts.peak, at + attack);
  env.gain.setValueAtTime(opts.peak, at + attack + hold);
  env.gain.setTargetAtTime(0, at + attack + hold, opts.decay / 3);
  osc.start(at);
  osc.stop(at + attack + hold + opts.decay * 2 + 0.05);
  release(osc, env, pan);
}

/** A looping noise bed through a chain of nodes. */
function bed(engine: SoundEngine, color: NoiseColor, chain: AudioNode[], out: Out): AudioBufferSourceNode {
  const source = engine.ctx.createBufferSource();
  source.buffer = engine.noise[color];
  source.loop = true;
  connectChain(source, ...chain, out);
  source.start(engine.ctx.currentTime, Math.random() * 3);
  return source;
}

interface Layer {
  /** The layer's own volume, which fades in and out. */
  gain: GainNode;
  /** Queues the layer's events from `from` up to `until`, in audio-clock seconds. */
  tick: (from: number, until: number) => void;
  stop: () => void;
}

/** Events at random gaps: calls `play` at each time up to `until`, then remembers where it stopped. */
function every(min: number, max: number, play: (at: number) => void) {
  let next = 0;
  return (from: number, until: number) => {
    if (next < from) next = from + rand(0, max);
    while (next < until) {
      play(next);
      next += rand(min, max);
    }
  };
}

type LayerMaker = (engine: SoundEngine, out: GainNode) => Pick<Layer, 'tick' | 'stop'>;

const LAYERS: Readonly<Record<NatureId, LayerMaker>> = {
  rain(engine, out) {
    const { ctx } = engine;
    const hiss = bed(
      engine,
      'pink',
      [filter(ctx, 'highpass', 450), filter(ctx, 'lowpass', 7000), gainNode(ctx, 0.5)],
      out,
    );
    const body = bed(engine, 'brown', [filter(ctx, 'lowpass', 900), gainNode(ctx, 0.35)], out);
    const drops = every(0.03, 0.11, (at) => {
      burst(engine, out, at, {
        type: 'bandpass',
        freq: rand(1800, 6000),
        q: 2,
        peak: rand(0.04, 0.16),
        decay: rand(0.015, 0.05),
        pan: rand(-0.9, 0.9),
      });
    });
    return {
      tick: drops,
      stop: () => {
        hiss.stop();
        body.stop();
      },
    };
  },

  waves(engine, out) {
    const { ctx } = engine;
    const low = filter(ctx, 'lowpass', 350);
    const swell = gainNode(ctx, 0.15);
    const surf = bed(engine, 'brown', [low, swell], out);
    const foamLevel = gainNode(ctx, 0.02);
    const foam = bed(engine, 'pink', [filter(ctx, 'highpass', 1800), foamLevel], out);
    const waves = every(7, 11, (at) => {
      const length = rand(7, 11);
      const crest = at + length * 0.45;
      swell.gain.setTargetAtTime(rand(0.7, 1), at, length * 0.15);
      swell.gain.setTargetAtTime(0.15, crest, length * 0.18);
      low.frequency.setTargetAtTime(rand(900, 1400), at, length * 0.15);
      low.frequency.setTargetAtTime(320, crest, length * 0.2);
      foamLevel.gain.setTargetAtTime(0.22, crest - 0.6, 0.4);
      foamLevel.gain.setTargetAtTime(0.02, crest + 0.4, length * 0.15);
    });
    return {
      tick: waves,
      stop: () => {
        surf.stop();
        foam.stop();
      },
    };
  },

  wind(engine, out) {
    const { ctx } = engine;
    const band = filter(ctx, 'bandpass', 500, 0.8);
    const level = gainNode(ctx, 0.6);
    const gust = bed(engine, 'pink', [band, level], out);
    const whistleBand = filter(ctx, 'bandpass', 900, 7);
    const whistle = bed(engine, 'pink', [whistleBand, gainNode(ctx, 0.08)], out);
    const gusts = every(1.8, 4, (at) => {
      band.frequency.setTargetAtTime(rand(250, 900), at, 1.2);
      level.gain.setTargetAtTime(rand(0.3, 1), at, 1.4);
      whistleBand.frequency.setTargetAtTime(rand(600, 1400), at, 1.6);
    });
    return {
      tick: gusts,
      stop: () => {
        gust.stop();
        whistle.stop();
      },
    };
  },

  stream(engine, out) {
    const { ctx } = engine;
    const bands = [0, 1, 2].map(() => filter(ctx, 'bandpass', rand(800, 2600), 6));
    const levels = bands.map(() => gainNode(ctx, 0.5));
    const sources = bands.map((band, i) =>
      bed(engine, 'white', [band, levels[i] ?? gainNode(ctx, 0.5)], out),
    );
    const under = bed(engine, 'pink', [filter(ctx, 'lowpass', 1200), gainNode(ctx, 0.25)], out);
    const babble = bands.map((band, i) =>
      every(0.06, 0.18, (at) => {
        band.frequency.setTargetAtTime(rand(700, 3200), at, 0.03);
        levels[i]?.gain.setTargetAtTime(rand(0.2, 0.8), at, 0.04);
      }),
    );
    return {
      tick: (from, until) => {
        for (const run of babble) run(from, until);
      },
      stop: () => {
        for (const source of sources) source.stop();
        under.stop();
      },
    };
  },

  fire(engine, out) {
    const { ctx } = engine;
    const roar = gainNode(ctx, 0.6);
    const rumble = bed(engine, 'brown', [filter(ctx, 'lowpass', 260), roar], out);
    const breath = bed(engine, 'pink', [filter(ctx, 'bandpass', 600, 0.7), gainNode(ctx, 0.1)], out);
    const flicker = every(0.15, 0.35, (at) => {
      roar.gain.setTargetAtTime(rand(0.4, 0.8), at, 0.12);
    });
    const crackle = every(0.04, 0.22, (at) => {
      const pop = Math.random() < 0.08;
      burst(engine, out, at, {
        type: 'highpass',
        freq: rand(1200, 3200),
        peak: pop ? rand(0.4, 0.6) : rand(0.06, 0.22),
        decay: pop ? rand(0.03, 0.06) : rand(0.004, 0.02),
        pan: rand(-0.6, 0.6),
      });
    });
    return {
      tick: (from, until) => {
        flicker(from, until);
        crackle(from, until);
      },
      stop: () => {
        rumble.stop();
        breath.stop();
      },
    };
  },

  cafe(engine, out) {
    const { ctx } = engine;
    const voiceA = gainNode(ctx, 0.4);
    const voiceB = gainNode(ctx, 0.3);
    const a = bed(engine, 'pink', [filter(ctx, 'bandpass', 650, 0.9), voiceA], out);
    const b = bed(engine, 'pink', [filter(ctx, 'bandpass', 1300, 1.4), voiceB], out);
    const room = bed(engine, 'brown', [filter(ctx, 'lowpass', 220), gainNode(ctx, 0.2)], out);
    const talkA = every(0.25, 0.7, (at) => {
      voiceA.gain.setTargetAtTime(rand(0.2, 0.7), at, 0.08);
    });
    const talkB = every(0.2, 0.6, (at) => {
      voiceB.gain.setTargetAtTime(rand(0.1, 0.5), at, 0.07);
    });
    const clinks = every(3, 9, (at) => {
      const base = rand(2000, 3200);
      const pan = rand(-0.8, 0.8);
      for (const ratio of [1, 1.62, 2.47]) {
        tone(engine, out, at, { freq: base * ratio, peak: 0.035 / ratio, decay: rand(0.25, 0.5), pan });
      }
    });
    return {
      tick: (from, until) => {
        talkA(from, until);
        talkB(from, until);
        clinks(from, until);
      },
      stop: () => {
        a.stop();
        b.stop();
        room.stop();
      },
    };
  },

  birds(engine, out) {
    const { ctx } = engine;
    const leaves = bed(engine, 'pink', [filter(ctx, 'lowpass', 1500), gainNode(ctx, 0.05)], out);
    const songs = every(1.2, 4, (at) => {
      const pan = rand(-0.85, 0.85);
      const kind = Math.floor(Math.random() * 3);
      if (kind === 0) {
        // A run of quick rising chirps.
        const count = Math.floor(rand(3, 7));
        for (let i = 0; i < count; i++) {
          const start = at + i * 0.13;
          tone(engine, out, start, {
            freq: rand(2800, 3300),
            to: rand(3900, 4600),
            glide: 0.07,
            peak: 0.07,
            decay: 0.05,
            pan,
          });
        }
      } else if (kind === 1) {
        // A two-note whistle that falls.
        const high = rand(2000, 2600);
        tone(engine, out, at, {
          freq: high,
          to: high * 0.85,
          glide: 0.3,
          peak: 0.06,
          attack: 0.03,
          hold: 0.2,
          decay: 0.08,
          pan,
        });
        tone(engine, out, at + 0.45, {
          freq: high * 0.8,
          to: high * 0.7,
          glide: 0.3,
          peak: 0.05,
          attack: 0.03,
          hold: 0.2,
          decay: 0.08,
          pan,
        });
      } else {
        // A fast trill.
        for (let i = 0; i < 10; i++) {
          tone(engine, out, at + i * 0.045, { freq: rand(4600, 5400), peak: 0.04, decay: 0.02, pan });
        }
      }
    });
    return {
      tick: songs,
      stop: () => {
        leaves.stop();
      },
    };
  },

  night(engine, out) {
    const { ctx } = engine;
    const air = bed(engine, 'brown', [filter(ctx, 'lowpass', 300), gainNode(ctx, 0.08)], out);
    const crickets = [0, 1, 2].map(() => {
      const pitch = rand(4300, 5100);
      const pan = rand(-0.8, 0.8);
      const pulses = Math.floor(rand(3, 5));
      return every(0.55, 0.95, (at) => {
        for (let i = 0; i < pulses; i++) {
          tone(engine, out, at + i * 0.035, {
            freq: pitch,
            peak: 0.035,
            attack: 0.003,
            hold: 0.015,
            decay: 0.01,
            pan,
          });
        }
      });
    });
    const frogs = every(4, 10, (at) => {
      const pan = rand(-0.7, 0.7);
      for (const offset of [0, 0.18]) {
        tone(engine, out, at + offset, {
          type: 'triangle',
          freq: 190,
          to: 140,
          glide: 0.1,
          peak: 0.07,
          attack: 0.01,
          hold: 0.05,
          decay: 0.05,
          pan,
        });
      }
    });
    return {
      tick: (from, until) => {
        for (const run of crickets) run(from, until);
        frogs(from, until);
      },
      stop: () => {
        air.stop();
      },
    };
  },
};

/** Plays one mood: drums, chords, bass, melody, crackle and a room echo. */
class MusicPlayer {
  private bar = 0;
  private step = 0;
  private next: number;
  private readonly out: GainNode;
  private readonly keysFilter: BiquadFilterNode;
  private readonly drums: GainNode;
  private readonly echo: GainNode;
  private readonly crackle: AudioBufferSourceNode;
  private readonly nodes: AudioNode[];

  constructor(
    private readonly engine: SoundEngine,
    readonly mood: Mood,
    volume: number,
  ) {
    const { ctx } = engine;
    this.out = gainNode(ctx, 0);
    this.out.connect(engine.musicBus);
    this.out.gain.setTargetAtTime(volume, ctx.currentTime, 0.4);
    this.keysFilter = filter(ctx, 'lowpass', mood.tone);
    this.keysFilter.connect(this.out);
    this.drums = gainNode(ctx, 0.9);
    const drumTone = filter(ctx, 'lowpass', mood.id === 'lofi' ? 5200 : 12000);
    connectChain(this.drums, drumTone, this.out);
    this.echo = gainNode(ctx, mood.reverb);
    connectChain(this.out, this.echo, engine.reverb);
    const crackleLevel = gainNode(ctx, mood.crackle * 0.5);
    this.crackle = ctx.createBufferSource();
    this.crackle.buffer = engine.crackle;
    this.crackle.loop = true;
    connectChain(this.crackle, filter(ctx, 'highpass', 300), crackleLevel, this.out);
    this.crackle.start(ctx.currentTime);
    this.nodes = [this.keysFilter, this.drums, drumTone, this.echo, crackleLevel];
    this.next = ctx.currentTime + 0.1;
  }

  setVolume(volume: number): void {
    this.out.gain.setTargetAtTime(volume, this.engine.ctx.currentTime, 0.2);
  }

  tick(until: number): void {
    const length = stepSeconds(this.mood);
    while (this.next < until) {
      const at = this.next + swingDelay(this.mood, this.step);
      for (const event of stepEvents(this.mood, this.bar, this.step)) this.play(event, at, length);
      this.next += length;
      this.step += 1;
      if (this.step === STEPS_PER_BAR) {
        this.step = 0;
        this.bar += 1;
      }
    }
  }

  private play(event: ReturnType<typeof stepEvents>[number], at: number, step: number): void {
    const { engine } = this;
    const v = event.velocity;
    switch (event.kind) {
      case 'kick':
        tone(engine, this.drums, at, { freq: 140, to: 45, glide: 0.12, peak: v * 0.9, decay: 0.3 });
        return;
      case 'snare':
        burst(engine, this.drums, at, { type: 'highpass', freq: 1200, peak: v * 0.32, decay: 0.12 });
        tone(engine, this.drums, at, {
          type: 'triangle',
          freq: 190,
          to: 150,
          glide: 0.05,
          peak: v * 0.18,
          decay: 0.06,
        });
        return;
      case 'clap':
        for (const offset of [0, 0.011, 0.022]) {
          burst(engine, this.drums, at + offset, {
            type: 'bandpass',
            freq: 1150,
            q: 1.2,
            peak: v * 0.3,
            decay: offset === 0.022 ? 0.1 : 0.01,
          });
        }
        return;
      case 'hat':
        burst(engine, this.drums, at, {
          type: 'highpass',
          freq: 7200,
          peak: v * 0.16,
          decay: this.mood.id === 'house' ? 0.07 : 0.03,
          pan: 0.25,
        });
        return;
      case 'bass': {
        const length = event.steps * step;
        tone(engine, this.out, at, {
          freq: frequency(event.note),
          peak: v * 0.32,
          attack: 0.01,
          hold: length * 0.7,
          decay: length * 0.25,
        });
        tone(engine, this.out, at, {
          type: 'triangle',
          freq: frequency(event.note + 12),
          peak: v * 0.06,
          attack: 0.01,
          hold: length * 0.5,
          decay: length * 0.2,
        });
        return;
      }
      case 'melody': {
        const length = event.steps * step;
        const pan = rand(-0.4, 0.4);
        tone(engine, this.keysFilter, at, {
          freq: frequency(event.note),
          peak: v * 0.09,
          decay: length * 0.8,
          pan,
        });
        tone(engine, this.keysFilter, at, {
          freq: frequency(event.note) * 2.01,
          peak: v * 0.025,
          decay: length * 0.4,
          pan,
        });
        return;
      }
      case 'chord': {
        const length = event.steps * step;
        const each = v / event.notes.length;
        for (const note of event.notes) {
          const freq = frequency(note);
          if (event.style === 'pad') {
            for (const detune of [-7, 7]) {
              tone(engine, this.keysFilter, at, {
                type: 'sawtooth',
                freq,
                detune,
                peak: each * 0.06,
                attack: 0.8,
                hold: Math.max(0, length - 0.8),
                decay: 1.2,
              });
            }
          } else if (event.style === 'stab') {
            tone(engine, this.keysFilter, at, { type: 'square', freq, peak: each * 0.07, decay: 0.16 });
          } else {
            tone(engine, this.keysFilter, at, {
              freq,
              peak: each * 0.22,
              attack: 0.008,
              hold: length * 0.3,
              decay: length * 0.6,
            });
            tone(engine, this.keysFilter, at, {
              type: 'triangle',
              freq,
              detune: 6,
              peak: each * 0.08,
              attack: 0.008,
              hold: length * 0.2,
              decay: length * 0.5,
            });
          }
        }
        return;
      }
    }
  }

  stop(): void {
    const { ctx } = this.engine;
    this.out.gain.setTargetAtTime(0, ctx.currentTime, 0.3);
    this.next = Infinity;
    setTimeout(() => {
      this.crackle.stop();
      this.out.disconnect();
      for (const node of this.nodes) node.disconnect();
    }, 2000);
  }
}

export class SoundEngine {
  readonly ctx: AudioContext;
  readonly master: GainNode;
  readonly natureBus: GainNode;
  readonly musicBus: GainNode;
  readonly keysBus: GainNode;
  readonly reverb: ConvolverNode;
  readonly noise: Readonly<Record<NoiseColor, AudioBuffer>>;
  readonly crackle: AudioBuffer;
  private readonly layers = new Map<NatureId, Layer>();
  private music: MusicPlayer | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(ctx: AudioContext = new AudioContext()) {
    this.ctx = ctx;
    this.master = gainNode(ctx, 0.7);
    this.master.connect(ctx.destination);
    this.natureBus = gainNode(ctx, 0.8);
    this.natureBus.connect(this.master);
    this.musicBus = gainNode(ctx, 1);
    this.musicBus.connect(this.master);
    this.keysBus = gainNode(ctx, 1);
    this.keysBus.connect(ctx.destination);
    this.reverb = ctx.createConvolver();
    this.reverb.buffer = roomImpulse(ctx, 2.6);
    this.reverb.connect(this.musicBus);
    this.noise = {
      white: noiseBuffer(ctx, 'white'),
      pink: noiseBuffer(ctx, 'pink'),
      brown: noiseBuffer(ctx, 'brown'),
    };
    this.crackle = crackleBuffer(ctx);
  }

  /** True while any ambient sound or music is set to play. */
  get busy(): boolean {
    return this.layers.size > 0 || this.music !== null;
  }

  async start(): Promise<void> {
    if (this.ctx.state !== 'running') await this.ctx.resume();
    this.master.gain.cancelScheduledValues(this.ctx.currentTime);
    this.timer ??= setInterval(() => {
      this.tick();
    }, TICK_MS);
    this.tick();
  }

  setMaster(volume: number): void {
    this.master.gain.setTargetAtTime(volume, this.ctx.currentTime, 0.15);
  }

  /** Fades each nature layer to its level in `mix`. A layer at 0 stops after its fade. */
  setNature(mix: NatureMix): void {
    const now = this.ctx.currentTime;
    for (const { id } of NATURE) {
      const level = mix[id] ?? 0;
      let layer = this.layers.get(id);
      if (level > 0 && !layer) {
        const gain = gainNode(this.ctx, 0);
        gain.connect(this.natureBus);
        layer = { gain, ...LAYERS[id](this, gain) };
        this.layers.set(id, layer);
      }
      if (!layer) continue;
      layer.gain.gain.setTargetAtTime(level, now, 0.4);
      if (level === 0) {
        const ending = layer;
        this.layers.delete(id);
        setTimeout(() => {
          ending.stop();
          ending.gain.disconnect();
        }, 2500);
      }
    }
    this.tick();
  }

  /** Plays a mood, or stops the generated music with null. */
  setMusic(mood: MoodId | null, volume: number): void {
    if (this.music && (mood === null || this.music.mood.id !== mood)) {
      this.music.stop();
      this.music = null;
    }
    if (mood === null) return;
    if (this.music) this.music.setVolume(volume);
    else this.music = new MusicPlayer(this, MOODS[mood], volume);
    this.tick();
  }

  private tick(): void {
    if (this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;
    const until = now + lookahead();
    for (const layer of this.layers.values()) layer.tick(now, until);
    this.music?.tick(until);
  }

  /** Fades all sound out over `seconds`, then pauses. Key sounds keep working. */
  async fadeOut(seconds: number): Promise<void> {
    const now = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(0, now, seconds / 4);
    await new Promise((resolve) => setTimeout(resolve, seconds * 1000));
    this.stopAll();
  }

  /** Stops every layer and the music at once. */
  stopAll(): void {
    this.setNature({});
    this.setMusic(null, 0);
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /** A soft typewriter key (E8). Enter rings the bell. */
  keyClick(key: string, volume: number): void {
    if (this.ctx.state !== 'running') {
      void this.ctx.resume();
      return;
    }
    const at = this.ctx.currentTime + 0.002;
    const out = this.keysBus;
    if (key === 'Enter') {
      tone(this, out, at, { freq: 2093, peak: 0.08 * volume, decay: 0.5 });
      tone(this, out, at, { freq: 4186, peak: 0.03 * volume, decay: 0.3 });
      return;
    }
    const space = key === ' ';
    burst(this, out, at, {
      type: 'bandpass',
      freq: space ? rand(900, 1200) : rand(2600, 3600),
      q: 1.4,
      peak: (space ? 0.35 : 0.5) * volume,
      decay: space ? 0.03 : 0.012,
    });
    tone(this, out, at, { freq: space ? 95 : rand(140, 170), peak: 0.12 * volume, decay: 0.03 });
  }

  async close(): Promise<void> {
    this.stopAll();
    await this.ctx.close();
  }
}
