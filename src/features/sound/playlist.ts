import type { Repeat } from './mix';

/* The writer's own music (plan decision 10): which file plays next, and which files Vlo can keep. */

/** The largest music file Vlo keeps, in bytes (50 MB). */
export const MAX_AUDIO_BYTES = 50 * 1024 * 1024;

const AUDIO_EXTENSIONS = /\.(mp3|m4a|aac|ogg|oga|opus|wav|flac|webm)$/i;

/** Megabytes with one decimal, for messages. */
export function megabytes(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1).replace(/\.0$/, '')} MB`;
}

/** Why Vlo cannot keep this file, or null when it can. */
export function audioFileProblem(file: { name: string; size: number; type: string }): string | null {
  if (!file.type.startsWith('audio/') && !AUDIO_EXTENSIONS.test(file.name)) {
    return `“${file.name}” is not a music file. Vlo plays MP3, M4A, AAC, OGG, Opus, WAV, FLAC and WebM audio.`;
  }
  if (file.size === 0) return `“${file.name}” is empty.`;
  if (file.size > MAX_AUDIO_BYTES) {
    return `“${file.name}” is ${megabytes(file.size)}. Vlo keeps music files up to 50 MB each.`;
  }
  return null;
}

/**
 * The index of the track after `current`, or null when the playlist ends. With shuffle, each track plays
 * once before any repeats; `played` holds the tracks that played in this round.
 */
export function nextTrack(
  current: number,
  count: number,
  opts: { shuffle: boolean; repeat: Repeat; played: ReadonlySet<number>; random?: () => number },
): number | null {
  if (count <= 0) return null;
  if (opts.repeat === 'one') return Math.min(Math.max(current, 0), count - 1);
  if (opts.shuffle) {
    let left = Array.from({ length: count }, (_, i) => i).filter((i) => !opts.played.has(i) && i !== current);
    if (left.length === 0) {
      if (opts.repeat === 'off') return null;
      // A new round: any track but the one that just played.
      left = Array.from({ length: count }, (_, i) => i).filter((i) => i !== current || count === 1);
    }
    const pick = Math.floor((opts.random ?? Math.random)() * left.length);
    return left[Math.min(pick, left.length - 1)] ?? null;
  }
  if (current + 1 < count) return current + 1;
  return opts.repeat === 'all' ? 0 : null;
}

/** The index of the track before `current`, for the Previous button. */
export function previousTrack(current: number, count: number): number | null {
  if (count <= 0) return null;
  return current > 0 ? current - 1 : count - 1;
}
