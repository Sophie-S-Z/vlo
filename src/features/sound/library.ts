import { useLiveQuery } from 'dexie-react-hooks';
import { db, type AudioFile } from '@/lib/db';
import { audioFileProblem } from './playlist';

/*
 * The writer's own music files, kept in IndexedDB on this device (plan decision 10). No file leaves the
 * device: Vlo plays each one from a blob: URL.
 */

export type AudioFileInfo = Omit<AudioFile, 'data'>;

/** How long Vlo waits for the browser to read a file's length before it calls the file unplayable. */
const PROBE_MS = 8000;

/** Resolves when this browser can play the file, or rejects with a message for the writer. */
export function probeAudio(file: Blob, name: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const audio = new Audio();
    audio.preload = 'metadata';
    const done = (fn: () => void) => {
      clearTimeout(timer);
      audio.removeAttribute('src');
      audio.load();
      URL.revokeObjectURL(url);
      fn();
    };
    const fail = () => {
      done(() => {
        reject(
          new Error(
            `Vlo cannot play “${name}”. The file may be damaged, or this browser may not play its format.`,
          ),
        );
      });
    };
    const timer = setTimeout(fail, PROBE_MS);
    audio.onloadedmetadata = () => {
      const seconds = audio.duration;
      done(() => {
        resolve(Number.isFinite(seconds) ? seconds : 0);
      });
    };
    audio.onerror = fail;
    audio.src = url;
  });
}

/**
 * Checks and keeps the files. Returns a message for each file Vlo did not keep. The files that pass go
 * in, in the order given.
 */
export async function addAudioFiles(files: readonly File[]): Promise<string[]> {
  const problems: string[] = [];
  let at = Date.now();
  for (const file of files) {
    const problem = audioFileProblem(file);
    if (problem) {
      problems.push(problem);
      continue;
    }
    try {
      const duration = await probeAudio(file, file.name);
      const data = await file.arrayBuffer();
      await db.audioFiles.add({
        id: crypto.randomUUID(),
        name: file.name.replace(/\.[^.]+$/, '') || file.name,
        type: file.type,
        size: file.size,
        duration,
        addedAt: at++,
        data,
      });
    } catch (error) {
      problems.push(
        error instanceof Error && error.message.startsWith('Vlo cannot play')
          ? error.message
          : `Vlo could not keep “${file.name}”. The device may be out of space.`,
      );
    }
  }
  return problems;
}

export async function removeAudioFile(id: string): Promise<void> {
  await db.audioFiles.delete(id);
}

export async function audioFileData(id: string): Promise<AudioFile | undefined> {
  return db.audioFiles.get(id);
}

/** The kept files in the order they were added, without their data. */
export async function listAudioFiles(): Promise<AudioFileInfo[]> {
  const files: AudioFileInfo[] = [];
  await db.audioFiles.orderBy('addedAt').each((file) => {
    files.push({
      id: file.id,
      name: file.name,
      type: file.type,
      size: file.size,
      duration: file.duration,
      addedAt: file.addedAt,
    });
  });
  return files;
}

export function useAudioFiles(): AudioFileInfo[] | undefined {
  return useLiveQuery(listAudioFiles, []);
}
