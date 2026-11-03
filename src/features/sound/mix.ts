import { useSyncExternalStore } from 'react';
import { safeStorage } from '@/app/preferences';
import type { SceneSound } from '../scenes/scenes';

/*
 * Sound settings (plan Task A9): the nature layers, the music source, the volumes and the switches. They
 * stay on this device. Nothing here plays sound; the controller reads these values after the writer
 * presses Play.
 */

export type NatureId = 'rain' | 'waves' | 'wind' | 'stream' | 'fire' | 'cafe' | 'birds' | 'night';

export interface NatureInfo {
  id: NatureId;
  label: string;
}

export const NATURE: readonly NatureInfo[] = [
  { id: 'rain', label: 'Rain' },
  { id: 'waves', label: 'Waves' },
  { id: 'wind', label: 'Wind' },
  { id: 'stream', label: 'Stream' },
  { id: 'fire', label: 'Fire' },
  { id: 'cafe', label: 'Café murmur' },
  { id: 'birds', label: 'Forest birds' },
  { id: 'night', label: 'Night chorus' },
];

export type MoodId = 'lofi' | 'melancholic' | 'soulful' | 'house' | 'dream';

/** The music that plays with the nature layers: a generated mood, the writer's own files, or none. */
export type MusicSource = MoodId | 'own' | 'off';

export const MOOD_LABELS: Readonly<Record<MoodId, string>> = {
  lofi: 'Lofi',
  melancholic: 'Melancholic',
  soulful: 'Soulful',
  house: 'Deep house',
  dream: 'Dream pop',
};

export type NatureMix = Partial<Record<NatureId, number>>;

/** The sound mix that each scene suggests. */
export const SCENE_MIX: Readonly<Record<SceneSound, NatureMix>> = {
  rain: { rain: 0.7, wind: 0.15 },
  fire: { fire: 0.75, wind: 0.1 },
  crickets: { night: 0.6, wind: 0.12 },
  forest: { birds: 0.55, stream: 0.3, wind: 0.12 },
  wind: { wind: 0.55, fire: 0.3 },
  waves: { waves: 0.7, wind: 0.15 },
};

export type Repeat = 'off' | 'all' | 'one';

/** Minutes until the sound fades out, or 0 for no sleep timer. */
export const SLEEP_CHOICES = [0, 15, 30, 45, 60, 90] as const;

export interface SoundSettings {
  /** The volume of everything, 0 to 1. */
  master: number;
  music: MusicSource;
  musicVolume: number;
  /** The writer's own nature mix. */
  nature: NatureMix;
  /** The nature layers follow the project's scene until the writer moves a layer. */
  followScene: boolean;
  shuffle: boolean;
  repeat: Repeat;
  /** Soft key clicks while typing (E8). Off by default. */
  typewriter: boolean;
  typewriterVolume: number;
}

export const SOUND_DEFAULTS: SoundSettings = {
  master: 0.7,
  music: 'lofi',
  musicVolume: 0.6,
  nature: {},
  followScene: true,
  shuffle: false,
  repeat: 'all',
  typewriter: false,
  typewriterVolume: 0.5,
};

const NATURE_IDS = new Set<string>(NATURE.map((n) => n.id));
const MUSIC_SOURCES = new Set<string>([...Object.keys(MOOD_LABELS), 'own', 'off']);

/** A volume from 0 to 1, or the fallback for anything else. */
export function cleanVolume(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : fallback;
}

/** Stored settings Vlo can use. Damaged or missing values fall back to the defaults. */
export function cleanSettings(value: unknown): SoundSettings {
  if (typeof value !== 'object' || value === null) return { ...SOUND_DEFAULTS, nature: {} };
  const v = value as Record<string, unknown>;
  const nature: NatureMix = {};
  if (typeof v.nature === 'object' && v.nature !== null) {
    for (const [id, level] of Object.entries(v.nature as Record<string, unknown>)) {
      const clean = cleanVolume(level, 0);
      if (NATURE_IDS.has(id) && clean > 0) nature[id as NatureId] = clean;
    }
  }
  return {
    master: cleanVolume(v.master, SOUND_DEFAULTS.master),
    music:
      typeof v.music === 'string' && MUSIC_SOURCES.has(v.music)
        ? (v.music as MusicSource)
        : SOUND_DEFAULTS.music,
    musicVolume: cleanVolume(v.musicVolume, SOUND_DEFAULTS.musicVolume),
    nature,
    followScene: typeof v.followScene === 'boolean' ? v.followScene : SOUND_DEFAULTS.followScene,
    shuffle: typeof v.shuffle === 'boolean' ? v.shuffle : SOUND_DEFAULTS.shuffle,
    repeat: v.repeat === 'off' || v.repeat === 'all' || v.repeat === 'one' ? v.repeat : SOUND_DEFAULTS.repeat,
    typewriter: typeof v.typewriter === 'boolean' ? v.typewriter : SOUND_DEFAULTS.typewriter,
    typewriterVolume: cleanVolume(v.typewriterVolume, SOUND_DEFAULTS.typewriterVolume),
  };
}

/**
 * The nature layers that play. A scene sets them while the writer follows it, except in Calm mode, where
 * a scene never starts a sound (plan decision 9).
 */
export function natureLevels(settings: SoundSettings, scene: SceneSound | null, calm: boolean): NatureMix {
  if (settings.followScene) return scene && !calm ? { ...SCENE_MIX[scene] } : {};
  return { ...settings.nature };
}

const KEY = 'vlo:sound';
const listeners = new Set<() => void>();

function load(): SoundSettings {
  try {
    const raw = safeStorage()?.getItem(KEY);
    return cleanSettings(raw ? JSON.parse(raw) : null);
  } catch {
    return cleanSettings(null);
  }
}

let current = load();

export function getSoundSettings(): SoundSettings {
  return current;
}

export function setSoundSettings(change: Partial<SoundSettings>): void {
  current = cleanSettings({ ...current, ...change });
  try {
    safeStorage()?.setItem(KEY, JSON.stringify(current));
  } catch {
    // Private windows can refuse storage. The settings still work until the page closes.
  }
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useSoundSettings(): SoundSettings {
  return useSyncExternalStore(subscribe, getSoundSettings, getSoundSettings);
}
