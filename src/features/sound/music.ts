import type { MoodId } from './mix';

/*
 * The generated music (plan Task A9): five moods, each a chord progression, a drum pattern, a bass line
 * and a way to play the chords. This file only decides which notes fall on which sixteenth step. The
 * sound engine turns the notes into sound. Notes are MIDI numbers (60 is middle C).
 */

export const STEPS_PER_BAR = 16;

interface Chord {
  /** The bass note. */
  root: number;
  /** The chord tones, voiced around middle C. */
  notes: readonly number[];
}

type KeysStyle = 'keys' | 'pad' | 'stab';
type BassStyle = 'root' | 'walk' | 'pulse' | 'long';
type MelodyStyle = 'none' | 'arp' | 'sparse';

export interface Mood {
  id: MoodId;
  /** One line on how the mood sounds, for the sound panel. */
  hint: string;
  bpm: number;
  /** How late the off sixteenths fall, as a share of one step. */
  swing: number;
  chords: readonly Chord[];
  keys: KeysStyle;
  bass: BassStyle;
  melody: MelodyStyle;
  drums: {
    kick: readonly number[];
    snare: readonly number[];
    /** Quiet snare hits between the main ones. */
    ghost: readonly number[];
    hat: readonly number[];
    /** A clap in place of the snare. */
    clap: boolean;
  };
  /** The level of the vinyl crackle, 0 to 1. */
  crackle: number;
  /** The share of the music sent to the room echo, 0 to 1. */
  reverb: number;
  /** The cutoff of the warm filter on the chords, in Hz. */
  tone: number;
}

const EIGHTHS = [0, 2, 4, 6, 8, 10, 12, 14];

export const MOODS: Readonly<Record<MoodId, Mood>> = {
  lofi: {
    id: 'lofi',
    hint: 'Dusty keys, a lazy swing and vinyl crackle at 78 beats a minute.',
    bpm: 78,
    swing: 0.18,
    chords: [
      { root: 38, notes: [53, 57, 60, 64] },
      { root: 43, notes: [53, 59, 64, 69] },
      { root: 36, notes: [52, 55, 59, 62] },
      { root: 45, notes: [55, 59, 60, 64] },
    ],
    keys: 'keys',
    bass: 'root',
    melody: 'sparse',
    drums: { kick: [0, 7, 10], snare: [4, 12], ghost: [], hat: EIGHTHS, clap: false },
    crackle: 0.6,
    reverb: 0.25,
    tone: 1800,
  },
  melancholic: {
    id: 'melancholic',
    hint: 'Slow minor chords with a lot of space, at 68 beats a minute.',
    bpm: 68,
    swing: 0.08,
    chords: [
      { root: 45, notes: [55, 60, 64, 71] },
      { root: 41, notes: [53, 57, 60, 64] },
      { root: 40, notes: [55, 60, 64, 67] },
      { root: 43, notes: [55, 60, 62, 67] },
    ],
    keys: 'pad',
    bass: 'long',
    melody: 'sparse',
    drums: { kick: [0, 9], snare: [8], ghost: [], hat: [0, 4, 8, 12], clap: false },
    crackle: 0.35,
    reverb: 0.5,
    tone: 1300,
  },
  soulful: {
    id: 'soulful',
    hint: 'Warm ninth chords, a walking bass and a deep pocket at 86 beats a minute.',
    bpm: 86,
    swing: 0.22,
    chords: [
      { root: 39, notes: [55, 58, 62, 65] },
      { root: 36, notes: [51, 55, 58, 62] },
      { root: 41, notes: [51, 56, 60, 67] },
      { root: 46, notes: [56, 60, 62, 67] },
    ],
    keys: 'keys',
    bass: 'walk',
    melody: 'none',
    drums: { kick: [0, 3, 8, 11], snare: [4, 12], ghost: [7, 15], hat: EIGHTHS, clap: false },
    crackle: 0.2,
    reverb: 0.3,
    tone: 2200,
  },
  house: {
    id: 'house',
    hint: 'A soft four-on-the-floor pulse with chord stabs at 120 beats a minute.',
    bpm: 120,
    swing: 0.04,
    chords: [
      { root: 45, notes: [60, 64, 67, 71] },
      { root: 38, notes: [53, 57, 60, 64] },
      { root: 41, notes: [57, 60, 64, 67] },
      { root: 40, notes: [55, 59, 62, 67] },
    ],
    keys: 'stab',
    bass: 'pulse',
    melody: 'none',
    drums: { kick: [0, 4, 8, 12], snare: [4, 12], ghost: [], hat: [2, 6, 10, 14], clap: true },
    crackle: 0,
    reverb: 0.3,
    tone: 2600,
  },
  dream: {
    id: 'dream',
    hint: 'Hazy pads and a glassy arpeggio in a big room, at 84 beats a minute.',
    bpm: 84,
    swing: 0,
    chords: [
      { root: 38, notes: [57, 61, 64, 66] },
      { root: 47, notes: [57, 62, 64, 66] },
      { root: 43, notes: [57, 59, 62, 66] },
      { root: 45, notes: [57, 59, 61, 64] },
    ],
    keys: 'pad',
    bass: 'long',
    melody: 'arp',
    drums: { kick: [0, 10], snare: [8], ghost: [], hat: EIGHTHS, clap: false },
    crackle: 0.1,
    reverb: 0.7,
    tone: 3200,
  },
};

export type DrumKind = 'kick' | 'snare' | 'clap' | 'hat';

export type MusicEvent =
  | { kind: DrumKind; velocity: number }
  | { kind: 'chord'; style: KeysStyle; notes: readonly number[]; steps: number; velocity: number }
  | { kind: 'bass'; note: number; steps: number; velocity: number }
  | { kind: 'melody'; note: number; steps: number; velocity: number };

/** A number from 0 up to 1 that is the same for the same bar, step and salt. */
export function chance(bar: number, step: number, salt: number): number {
  let x = Math.imul(bar + 1, 0x9e3779b1) ^ Math.imul(step + 7, 0x85ebca6b) ^ Math.imul(salt + 13, 0xc2b2ae35);
  x = Math.imul(x ^ (x >>> 16), 0x7feb352d);
  x = Math.imul(x ^ (x >>> 15), 0x846ca68b);
  return ((x ^ (x >>> 16)) >>> 0) / 4294967296;
}

export function chordAt(mood: Mood, bar: number): Chord {
  const chords = mood.chords;
  const chord = chords[((bar % chords.length) + chords.length) % chords.length];
  if (!chord) throw new Error(`The mood ${mood.id} has no chords`);
  return chord;
}

/** Seconds per sixteenth step. */
export function stepSeconds(mood: Mood): number {
  return 60 / mood.bpm / 4;
}

/** How late a step falls after its straight time, in seconds. Only the off sixteenths swing. */
export function swingDelay(mood: Mood, step: number): number {
  return step % 2 === 1 ? mood.swing * stepSeconds(mood) : 0;
}

/** A touch of difference in each hit, so the drums do not sound like a machine. */
function human(base: number, bar: number, step: number, salt: number): number {
  return Math.min(1, base * (0.86 + 0.14 * chance(bar, step, salt)));
}

function drumEvents(mood: Mood, bar: number, step: number): MusicEvent[] {
  const { drums } = mood;
  const events: MusicEvent[] = [];
  if (drums.kick.includes(step))
    events.push({ kind: 'kick', velocity: human(step === 0 ? 1 : 0.8, bar, step, 1) });
  if (drums.snare.includes(step)) {
    events.push({ kind: drums.clap ? 'clap' : 'snare', velocity: human(0.8, bar, step, 2) });
  }
  if (drums.ghost.includes(step)) events.push({ kind: 'snare', velocity: human(0.25, bar, step, 3) });
  // The last bar of each four has a short fill.
  if (bar % 4 === 3 && (step === 14 || step === 15) && !drums.snare.includes(step)) {
    events.push({ kind: 'snare', velocity: human(step === 14 ? 0.35 : 0.5, bar, step, 4) });
  }
  if (drums.hat.includes(step)) {
    const accent = step % 4 === 0 ? 0.55 : 0.4;
    events.push({ kind: 'hat', velocity: human(accent, bar, step, 5) });
  } else if (mood.id === 'lofi' && step % 2 === 1 && chance(bar, step, 6) < 0.12) {
    // Now and then a soft extra hat between the eighths.
    events.push({ kind: 'hat', velocity: 0.18 });
  }
  return events;
}

function keysEvents(mood: Mood, chord: Chord, bar: number, step: number): MusicEvent[] {
  const chordEvent = (steps: number, velocity: number): MusicEvent => ({
    kind: 'chord',
    style: mood.keys,
    notes: chord.notes,
    steps,
    velocity: human(velocity, bar, step, 7),
  });
  switch (mood.keys) {
    case 'pad':
      return step === 0 ? [chordEvent(STEPS_PER_BAR, 0.6)] : [];
    case 'stab':
      return step === 3 || step === 10 ? [chordEvent(1, 0.55)] : [];
    case 'keys':
      if (step === 0) return [chordEvent(7, 0.6)];
      return step === 10 ? [chordEvent(5, 0.42)] : [];
  }
}

function bassEvents(mood: Mood, chord: Chord, bar: number, step: number): MusicEvent[] {
  const root = chord.root;
  const note = (n: number, steps: number, velocity: number): MusicEvent[] => [
    { kind: 'bass', note: n, steps, velocity: human(velocity, bar, step, 8) },
  ];
  switch (mood.bass) {
    case 'long':
      return step === 0 ? note(root, STEPS_PER_BAR, 0.6) : [];
    case 'pulse':
      return step % 4 === 2 ? note(root, 1, 0.7) : [];
    case 'root':
      if (step === 0) return note(root, 6, 0.75);
      return step === 10 ? note(root, 4, 0.6) : [];
    case 'walk': {
      const next = chordAt(mood, bar + 1).root;
      if (step === 0) return note(root, 4, 0.75);
      if (step === 6) return note(root + 7, 2, 0.6);
      if (step === 8) return note(root + 12, 3, 0.6);
      // A step toward the next chord's root.
      return step === 12 ? note(next + (next > root ? -1 : 1), 3, 0.55) : [];
    }
  }
}

function melodyEvents(mood: Mood, chord: Chord, bar: number, step: number): MusicEvent[] {
  const notes = chord.notes;
  if (mood.melody === 'arp') {
    if (step % 2 !== 0) return [];
    const order = [0, 1, 2, 3, 2, 1, 3, 2];
    const tone = notes[order[step / 2] ?? 0] ?? notes[0] ?? 60;
    return [{ kind: 'melody', note: tone + 12, steps: 2, velocity: human(0.32, bar, step, 9) }];
  }
  if (mood.melody === 'sparse') {
    // About one note in three of the quarter beats, from the chord, an octave up.
    if (step % 4 !== 0 || chance(bar, step, 10) > 0.34) return [];
    const tone = notes[Math.floor(chance(bar, step, 11) * notes.length)] ?? notes[0] ?? 60;
    return [{ kind: 'melody', note: tone + 12, steps: 4, velocity: human(0.4, bar, step, 12) }];
  }
  return [];
}

/** Every note that starts on this step of this bar. */
export function stepEvents(mood: Mood, bar: number, step: number): MusicEvent[] {
  const chord = chordAt(mood, bar);
  return [
    ...drumEvents(mood, bar, step),
    ...keysEvents(mood, chord, bar, step),
    ...bassEvents(mood, chord, bar, step),
    ...melodyEvents(mood, chord, bar, step),
  ];
}

/** The frequency of a MIDI note in Hz. */
export function frequency(note: number): number {
  return 440 * 2 ** ((note - 69) / 12);
}
