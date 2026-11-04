import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { keyPressed, onEditorKey } from '@/features/editor/keyEvents';
import { SCENES } from '@/features/scenes/scenes';
import { SoundEngine } from '@/features/sound/engine';
import {
  cleanSettings,
  MOOD_LABELS,
  NATURE,
  natureLevels,
  SCENE_MIX,
  SOUND_DEFAULTS,
  type MoodId,
} from '@/features/sound/mix';
import {
  chance,
  chordAt,
  frequency,
  MOODS,
  stepEvents,
  stepSeconds,
  STEPS_PER_BAR,
  swingDelay,
  type MusicEvent,
} from '@/features/sound/music';
import {
  audioFileProblem,
  MAX_AUDIO_BYTES,
  megabytes,
  nextTrack,
  previousTrack,
} from '@/features/sound/playlist';

/* Task A9: sound. The settings, the music patterns, the playlist rules, key events and the engine. */

describe('sound settings', () => {
  it('start with music on Lofi, the scene followed, and key sounds off', () => {
    expect(SOUND_DEFAULTS).toMatchObject({ music: 'lofi', followScene: true, typewriter: false });
    expect(cleanSettings(null)).toEqual(SOUND_DEFAULTS);
  });

  it('keep good stored values and replace damaged ones', () => {
    const clean = cleanSettings({
      master: 2,
      music: 'house',
      musicVolume: -1,
      nature: { rain: 0.5, lava: 1, wind: 'loud', fire: 0 },
      followScene: false,
      shuffle: 'yes',
      repeat: 'one',
      typewriter: true,
      typewriterVolume: Number.NaN,
    });
    expect(clean).toEqual({
      master: 1,
      music: 'house',
      musicVolume: 0,
      nature: { rain: 0.5 },
      followScene: false,
      shuffle: false,
      repeat: 'one',
      typewriter: true,
      typewriterVolume: SOUND_DEFAULTS.typewriterVolume,
    });
    expect(cleanSettings({ music: 'jazz' }).music).toBe('lofi');
  });

  it('give every scene a mix of known nature layers', () => {
    const ids = new Set(NATURE.map((n) => n.id));
    for (const scene of SCENES) {
      const mix = SCENE_MIX[scene.sound];
      expect(Object.keys(mix).length).toBeGreaterThan(0);
      for (const [id, level] of Object.entries(mix)) {
        expect(ids.has(id as never)).toBe(true);
        expect(level).toBeGreaterThan(0);
        expect(level).toBeLessThanOrEqual(1);
      }
    }
  });

  it('follow the scene, except in Calm mode, where a scene starts no sound', () => {
    const following = { ...SOUND_DEFAULTS, followScene: true, nature: { stream: 0.4 } };
    expect(natureLevels(following, 'rain', false)).toEqual(SCENE_MIX.rain);
    expect(natureLevels(following, 'rain', true)).toEqual({});
    expect(natureLevels(following, null, false)).toEqual({});
    const own = { ...following, followScene: false };
    expect(natureLevels(own, 'rain', false)).toEqual({ stream: 0.4 });
    // A sound the writer chose is a choice, so it plays in Calm mode.
    expect(natureLevels(own, 'rain', true)).toEqual({ stream: 0.4 });
  });
});

describe('the music patterns', () => {
  const moods = Object.keys(MOOD_LABELS) as MoodId[];

  it.each(moods)('%s has four chords, a tempo from 60 to 130 and notes in a sane range', (id) => {
    const mood = MOODS[id];
    expect(mood.chords).toHaveLength(4);
    expect(mood.bpm).toBeGreaterThanOrEqual(60);
    expect(mood.bpm).toBeLessThanOrEqual(130);
    expect(mood.hint).toMatch(/\.$/);
    for (let bar = 0; bar < 8; bar++) {
      for (let step = 0; step < STEPS_PER_BAR; step++) {
        for (const event of stepEvents(mood, bar, step)) {
          expect(event.velocity).toBeGreaterThan(0);
          expect(event.velocity).toBeLessThanOrEqual(1);
          if (event.kind === 'chord') for (const n of event.notes) expect(n).toBeGreaterThanOrEqual(48);
          if (event.kind === 'bass') {
            expect(event.note).toBeGreaterThanOrEqual(30);
            expect(event.note).toBeLessThan(60);
          }
        }
      }
    }
  });

  it.each(moods)('%s starts each bar with a kick, a bass note and the chord of that bar', (id) => {
    const mood = MOODS[id];
    for (let bar = 0; bar < 4; bar++) {
      const first = stepEvents(mood, bar, 0);
      expect(first.some((e) => e.kind === 'kick')).toBe(true);
      expect(first.find((e) => e.kind === 'bass') ?? mood.bass === 'pulse').toBeTruthy();
      const chord = stepEvents(mood, bar, mood.keys === 'stab' ? 3 : 0).find(
        (e): e is Extract<MusicEvent, { kind: 'chord' }> => e.kind === 'chord',
      );
      expect(chord?.notes).toEqual(chordAt(mood, bar).notes);
    }
  });

  it('gives the same notes for the same bar and step, so a mood sounds the same each time', () => {
    const mood = MOODS.lofi;
    expect(stepEvents(mood, 5, 7)).toEqual(stepEvents(mood, 5, 7));
    expect(chance(1, 2, 3)).toBe(chance(1, 2, 3));
    expect(chance(1, 2, 3)).not.toBe(chance(1, 2, 4));
  });

  it('plays deep house four on the floor with a clap on two and four', () => {
    const kicks = [];
    const claps = [];
    for (let step = 0; step < STEPS_PER_BAR; step++) {
      const events = stepEvents(MOODS.house, 0, step);
      if (events.some((e) => e.kind === 'kick')) kicks.push(step);
      if (events.some((e) => e.kind === 'clap')) claps.push(step);
    }
    expect(kicks).toEqual([0, 4, 8, 12]);
    expect(claps).toEqual([4, 12]);
  });

  it('adds a short fill in the last bar of four', () => {
    const snares = (bar: number) => stepEvents(MOODS.lofi, bar, 15).filter((e) => e.kind === 'snare').length;
    expect(snares(3)).toBe(1);
    expect(snares(2)).toBe(0);
  });

  it('swings only the off sixteenths, and times steps from the tempo', () => {
    const mood = MOODS.lofi;
    expect(stepSeconds(mood)).toBeCloseTo(60 / 78 / 4, 6);
    expect(swingDelay(mood, 0)).toBe(0);
    expect(swingDelay(mood, 1)).toBeCloseTo(0.18 * stepSeconds(mood), 6);
    expect(swingDelay(MOODS.dream, 1)).toBe(0);
  });

  it('turns MIDI notes into frequencies', () => {
    expect(frequency(69)).toBe(440);
    expect(frequency(57)).toBeCloseTo(220, 6);
    expect(frequency(60)).toBeCloseTo(261.626, 2);
  });
});

describe('own music files', () => {
  it('takes audio files up to 50 MB and explains anything else', () => {
    expect(audioFileProblem({ name: 'rain.mp3', size: 1000, type: 'audio/mpeg' })).toBeNull();
    expect(audioFileProblem({ name: 'tape.flac', size: 1000, type: '' })).toBeNull();
    expect(audioFileProblem({ name: 'notes.pdf', size: 1000, type: 'application/pdf' })).toMatch(
      /not a music file/,
    );
    expect(audioFileProblem({ name: 'blank.wav', size: 0, type: 'audio/wav' })).toMatch(/empty/);
    expect(audioFileProblem({ name: 'long.wav', size: MAX_AUDIO_BYTES + 1, type: 'audio/wav' })).toBe(
      '“long.wav” is 50 MB. Vlo keeps music files up to 50 MB each.',
    );
    expect(audioFileProblem({ name: 'huge.wav', size: 63 * 1024 * 1024, type: 'audio/wav' })).toMatch(
      /is 63 MB/,
    );
    expect(megabytes(1.5 * 1024 * 1024)).toBe('1.5 MB');
  });

  it('plays the next file in order, and repeats or stops at the end', () => {
    const none = new Set<number>();
    expect(nextTrack(0, 3, { shuffle: false, repeat: 'off', played: none })).toBe(1);
    expect(nextTrack(2, 3, { shuffle: false, repeat: 'off', played: none })).toBeNull();
    expect(nextTrack(2, 3, { shuffle: false, repeat: 'all', played: none })).toBe(0);
    expect(nextTrack(1, 3, { shuffle: false, repeat: 'one', played: none })).toBe(1);
    expect(nextTrack(-1, 3, { shuffle: false, repeat: 'off', played: none })).toBe(0);
    expect(nextTrack(0, 0, { shuffle: false, repeat: 'all', played: none })).toBeNull();
    expect(previousTrack(0, 3)).toBe(2);
    expect(previousTrack(2, 3)).toBe(1);
  });

  it('shuffles through every file once before any file repeats', () => {
    const played = new Set<number>([0]);
    let current = 0;
    for (let i = 0; i < 4; i++) {
      const next = nextTrack(current, 5, { shuffle: true, repeat: 'off', played, random: Math.random });
      expect(next).not.toBeNull();
      expect(played.has(next ?? -1)).toBe(false);
      played.add(next ?? -1);
      current = next ?? 0;
    }
    expect(played.size).toBe(5);
    expect(nextTrack(current, 5, { shuffle: true, repeat: 'off', played })).toBeNull();
    const again = nextTrack(current, 5, { shuffle: true, repeat: 'all', played, random: () => 0.99 });
    expect(again).not.toBe(current);
    expect(nextTrack(0, 1, { shuffle: true, repeat: 'all', played: new Set([0]) })).toBe(0);
  });
});

describe('editor key events', () => {
  afterEach(() => {
    onEditorKey(null);
  });

  it('pass on keys that type, and nothing with a shortcut or during composition', () => {
    const keys: string[] = [];
    onEditorKey((key) => keys.push(key));
    const press = (init: KeyboardEventInit) => {
      keyPressed(new KeyboardEvent('keydown', init));
    };
    press({ key: 'a' });
    press({ key: ' ' });
    press({ key: 'Enter' });
    press({ key: 'Backspace' });
    press({ key: 'Shift' });
    press({ key: 'ArrowLeft' });
    press({ key: 'b', ctrlKey: true });
    press({ key: 'c', metaKey: true });
    press({ key: 'd', isComposing: true });
    expect(keys).toEqual(['a', ' ', 'Enter', 'Backspace']);
    onEditorKey(null);
    press({ key: 'e' });
    expect(keys).toHaveLength(4);
  });
});

/* A stand-in for the Web Audio API: every node records its connections, and sources record start and stop. */

interface FakeNode {
  kind: string;
  connections: FakeNode[];
  started: number;
  stopped: number;
}

function fakeParam() {
  return {
    value: 0,
    setValueAtTime: vi.fn(),
    linearRampToValueAtTime: vi.fn(),
    exponentialRampToValueAtTime: vi.fn(),
    setTargetAtTime: vi.fn(),
    cancelScheduledValues: vi.fn(),
  };
}

class FakeAudioContext {
  state: AudioContextState = 'suspended';
  currentTime = 0;
  sampleRate = 8000;
  nodes: FakeNode[] = [];
  destination = this.node('destination');

  node(kind: string) {
    const node = {
      kind,
      connections: [] as FakeNode[],
      started: 0,
      stopped: 0,
      gain: fakeParam(),
      frequency: fakeParam(),
      detune: fakeParam(),
      Q: fakeParam(),
      pan: fakeParam(),
      type: '',
      buffer: null as unknown,
      loop: false,
      onended: null as unknown,
      connect(target: FakeNode) {
        this.connections.push(target);
        return target;
      },
      disconnect() {
        this.connections = [];
      },
      start() {
        this.started += 1;
      },
      stop() {
        this.stopped += 1;
      },
    };
    this.nodes.push(node);
    return node;
  }

  createGain = () => this.node('gain');
  createBiquadFilter = () => this.node('filter');
  createStereoPanner = () => this.node('panner');
  createOscillator = () => this.node('oscillator');
  createBufferSource = () => this.node('source');
  createConvolver = () => this.node('convolver');
  createBuffer = (channels: number, length: number) => ({
    getChannelData: () => new Float32Array(length),
    numberOfChannels: channels,
  });

  resume = vi.fn(() => {
    this.state = 'running';
    return Promise.resolve();
  });
  close = vi.fn(() => {
    this.state = 'closed';
    return Promise.resolve();
  });
}

describe('the sound engine', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  function engine() {
    const ctx = new FakeAudioContext();
    return { ctx, engine: new SoundEngine(ctx as unknown as AudioContext) };
  }

  const sources = (ctx: FakeAudioContext) =>
    ctx.nodes.filter((n) => (n.kind === 'oscillator' || n.kind === 'source') && n.started > 0);

  it('makes no sound until it starts', () => {
    const { ctx } = engine();
    expect(sources(ctx)).toHaveLength(0);
    expect(ctx.resume).not.toHaveBeenCalled();
  });

  it('starts every nature layer and every mood without an error, and queues their sounds', async () => {
    const { ctx, engine: e } = engine();
    await e.start();
    expect(ctx.state).toBe('running');
    e.setNature(Object.fromEntries(NATURE.map((n) => [n.id, 0.5])));
    for (const id of Object.keys(MOOD_LABELS) as MoodId[]) {
      e.setMusic(id, 0.6);
      for (let i = 0; i < 20; i++) {
        ctx.currentTime += 0.06;
        vi.advanceTimersByTime(60);
      }
    }
    expect(e.busy).toBe(true);
    expect(sources(ctx).length).toBeGreaterThan(100);
    e.stopAll();
    vi.advanceTimersByTime(3000);
    expect(e.busy).toBe(false);
    const before = sources(ctx).length;
    ctx.currentTime += 1;
    vi.advanceTimersByTime(1000);
    expect(sources(ctx).length).toBe(before);
  });

  it('stops a nature layer that goes to 0 after its fade', async () => {
    const { ctx, engine: e } = engine();
    await e.start();
    e.setNature({ rain: 0.6 });
    const beds = ctx.nodes.filter((n) => n.kind === 'source' && n.started > 0 && n.stopped === 0);
    expect(beds.length).toBeGreaterThan(0);
    e.setNature({});
    vi.advanceTimersByTime(3000);
    for (const bed of beds) expect(bed.stopped).toBeGreaterThan(0);
  });

  it('clicks a key only while the audio runs, and rings a bell for Enter', async () => {
    const { ctx, engine: e } = engine();
    e.keyClick('a', 0.5);
    expect(ctx.resume).toHaveBeenCalled();
    await e.start();
    const before = sources(ctx).length;
    e.keyClick('a', 0.5);
    e.keyClick('Enter', 0.5);
    expect(sources(ctx).length).toBe(before + 4);
  });
});
