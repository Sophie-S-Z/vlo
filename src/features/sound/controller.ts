import { useSyncExternalStore } from 'react';
import type { SceneSound } from '../scenes/scenes';
import { onEditorKey } from '../editor/keyEvents';
import type { SoundEngine } from './engine';
import { audioFileData, listAudioFiles, type AudioFileInfo } from './library';
import { getSoundSettings, natureLevels, setSoundSettings, type SoundSettings } from './mix';
import { nextTrack, previousTrack } from './playlist';

/*
 * The one sound controller (plan Task A9). Nothing plays until the writer presses Play (plan decision 9).
 * Play loads the engine, starts the nature layers and the music, and keeps them in step with the settings,
 * the project's scene and Calm mode. Pause, the sleep timer and leaving the project stop it.
 */

export interface SoundState {
  playing: boolean;
  /** When the sleep timer ends, in ms since 1970, or null. */
  sleepEndsAt: number | null;
  /** The minutes the sleep timer was set for, or 0. */
  sleepMinutes: number;
  /** The writer's own file that plays now. */
  track: AudioFileInfo | null;
  /** A problem to show the writer, such as a file that does not play. */
  message: string | null;
}

/** How long the sleep timer fades the sound out, in seconds. */
export const SLEEP_FADE_SECONDS = 10;

let state: SoundState = { playing: false, sleepEndsAt: null, sleepMinutes: 0, track: null, message: null };
const listeners = new Set<() => void>();

function setState(change: Partial<SoundState>): void {
  state = { ...state, ...change };
  for (const listener of listeners) listener();
}

export function getSoundState(): SoundState {
  return state;
}

export function useSoundState(): SoundState {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    getSoundState,
    getSoundState,
  );
}

/* The engine loads on first use. Once its code is here, Play makes the audio context in the same click. */

type EngineModule = typeof import('./engine');
let engineModule: EngineModule | null = null;
let engineLoad: Promise<EngineModule> | null = null;
let engine: SoundEngine | null = null;

/** Fetches the engine code ahead of Play, with no sound and no audio context. */
export function preloadEngine(): Promise<EngineModule> {
  engineLoad ??= import('./engine').then((module) => {
    engineModule = module;
    return module;
  });
  return engineLoad;
}

async function getEngine(): Promise<SoundEngine> {
  if (engine) return engine;
  const module = engineModule ?? (await preloadEngine());
  engine ??= new module.SoundEngine();
  return engine;
}

/* Where the sound plays: the project's scene and Calm mode. */

let scene: SceneSound | null = null;
let calm = false;

/** The scene sound and Calm mode of the open project. */
export function setSoundContext(next: { scene: SceneSound | null; calm: boolean }): void {
  if (next.scene === scene && next.calm === calm) return;
  scene = next.scene;
  calm = next.calm;
  updateKeys();
  if (state.playing) void apply();
}

/** The nature levels that play now. */
export function currentNature(settings: SoundSettings = getSoundSettings()) {
  return natureLevels(settings, scene, calm);
}

/* The writer's own music, through one audio element. */

let audio: HTMLAudioElement | null = null;
let audioUrl: string | null = null;
let trackIndex = -1;
let played = new Set<number>();
/** The volume the sleep fade scales the own music by, 0 to 1. */
let fade = 1;

function ownVolume(settings: SoundSettings): number {
  return settings.master * settings.musicVolume * fade;
}

function clearAudio(): void {
  if (audio) {
    audio.pause();
    audio.removeAttribute('src');
    audio.load();
  }
  if (audioUrl) URL.revokeObjectURL(audioUrl);
  audioUrl = null;
}

function getAudio(): HTMLAudioElement {
  if (audio) return audio;
  const element = new Audio();
  element.preload = 'auto';
  element.onended = () => {
    void advance(1);
  };
  element.onerror = () => {
    if (!element.getAttribute('src')) return;
    const name = state.track?.name ?? 'This file';
    clearAudio();
    setState({
      track: null,
      message: `Vlo cannot play “${name}”. The file may be damaged, or this browser may not play its format.`,
    });
  };
  audio = element;
  return element;
}

/** Plays the own file at `index` in the list, or stops own music with null. */
async function playOwn(index: number | null): Promise<void> {
  const files = await listAudioFiles();
  if (index === null || files.length === 0) {
    clearAudio();
    trackIndex = -1;
    setState({
      track: null,
      message: files.length === 0 ? 'Add music files to play your own music.' : state.message,
    });
    return;
  }
  const info = files[Math.min(index, files.length - 1)];
  if (!info) return;
  const file = await audioFileData(info.id);
  if (!file || !state.playing || getSoundSettings().music !== 'own') return;
  clearAudio();
  trackIndex = files.indexOf(info);
  played.add(trackIndex);
  audioUrl = URL.createObjectURL(file.data);
  const element = getAudio();
  element.src = audioUrl;
  element.volume = ownVolume(getSoundSettings());
  setState({ track: info, message: null });
  try {
    await element.play();
  } catch (error) {
    // A pause during the start is not a problem. Anything else is a file this browser does not play.
    if (error instanceof DOMException && error.name === 'AbortError') return;
    clearAudio();
    setState({
      track: null,
      message: `Vlo cannot play “${info.name}”. The file may be damaged, or this browser may not play its format.`,
    });
  }
}

async function advance(direction: 1 | -1): Promise<void> {
  const settings = getSoundSettings();
  const count = (await listAudioFiles()).length;
  const next =
    direction === 1
      ? nextTrack(trackIndex, count, { shuffle: settings.shuffle, repeat: settings.repeat, played })
      : previousTrack(trackIndex, count);
  if (direction === 1 && settings.shuffle && next !== null && played.size >= count) played = new Set();
  await playOwn(next);
}

/** Skips to the next or the previous own file. */
export function skipTrack(direction: 1 | -1): void {
  if (state.playing && getSoundSettings().music === 'own') void advance(direction);
}

/** Plays one of the writer's own files now. */
export async function playTrack(id: string): Promise<void> {
  const files = await listAudioFiles();
  const index = files.findIndex((f) => f.id === id);
  if (index < 0) return;
  played = new Set();
  if (getSoundSettings().music !== 'own') setSoundSettings({ music: 'own' });
  if (!state.playing) await play();
  await playOwn(index);
}

/* Play, pause and the sleep timer. */

let sleepTimer: ReturnType<typeof setTimeout> | null = null;
let fadeTimer: ReturnType<typeof setInterval> | null = null;

function clearSleep(): void {
  if (sleepTimer) clearTimeout(sleepTimer);
  if (fadeTimer) clearInterval(fadeTimer);
  sleepTimer = null;
  fadeTimer = null;
  fade = 1;
}

async function apply(): Promise<void> {
  const settings = getSoundSettings();
  const current = await getEngine();
  if (!state.playing) return;
  current.setMaster(settings.master * fade);
  current.setNature(currentNature(settings));
  const mood = settings.music === 'own' || settings.music === 'off' ? null : settings.music;
  current.setMusic(mood, settings.musicVolume);
  if (settings.music === 'own') {
    if (audio) audio.volume = ownVolume(settings);
    if (!audioUrl) await playOwn(trackIndex >= 0 ? trackIndex : 0);
  } else if (audioUrl) {
    clearAudio();
    trackIndex = -1;
    setState({ track: null });
  }
}

/** Starts the sound. Call it from the writer's click, so the browser lets it play. */
export async function play(): Promise<void> {
  if (state.playing) return;
  clearSleep();
  setState({ playing: true, message: null });
  try {
    const current = await getEngine();
    await current.start();
    await apply();
  } catch {
    setState({ playing: false, message: 'This browser did not start the sound. Press Play to try again.' });
  }
}

/** Stops every sound at once. Key sounds stay as they are. */
export function pause(): void {
  clearSleep();
  engine?.stopAll();
  clearAudio();
  setState({ playing: false, sleepEndsAt: null, sleepMinutes: 0, track: null });
}

/** Fades the sound out after `minutes`, or turns the sleep timer off with 0. */
export function setSleep(minutes: number): void {
  clearSleep();
  if (minutes <= 0 || !state.playing) {
    setState({ sleepEndsAt: null, sleepMinutes: 0 });
    if (state.playing) void apply();
    return;
  }
  const ms = minutes * 60_000;
  setState({ sleepEndsAt: Date.now() + ms, sleepMinutes: minutes });
  sleepTimer = setTimeout(() => {
    const steps = SLEEP_FADE_SECONDS * 4;
    let step = 0;
    void engine?.fadeOut(SLEEP_FADE_SECONDS);
    fadeTimer = setInterval(() => {
      step += 1;
      fade = Math.max(0, 1 - step / steps);
      if (audio) audio.volume = ownVolume(getSoundSettings());
      if (step >= steps) pause();
    }, 250);
  }, ms);
}

/* Typewriter key sounds (E8): on only when the writer turns them on, and never in Calm mode. */

function updateKeys(): void {
  const settings = getSoundSettings();
  if (!settings.typewriter || calm) {
    onEditorKey(null);
    return;
  }
  onEditorKey((key) => {
    const now = getSoundSettings();
    if (engine) engine.keyClick(key, now.typewriterVolume * now.master);
    else void getEngine();
  });
}

/** Turns key sounds on or off. Call it from the writer's click, so the browser lets the clicks play. */
export async function setTypewriter(on: boolean): Promise<void> {
  setSoundSettings({ typewriter: on });
  updateKeys();
  if (on && !calm) {
    const current = await getEngine();
    if (current.ctx.state !== 'running') await current.ctx.resume();
  }
}

/** Changes settings and applies them at once while sound plays. */
export function changeSound(change: Partial<SoundSettings>): void {
  setSoundSettings(change);
  updateKeys();
  if (state.playing) void apply();
}

export function dismissSoundMessage(): void {
  setState({ message: null });
}

updateKeys();
