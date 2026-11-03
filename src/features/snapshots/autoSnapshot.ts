import type * as Y from 'yjs';
import { clock } from '@/lib/clock';

const MINUTE_MS = 60_000;

/*
 * Active minutes per item, kept while the app is open. Switching to another item and back adds to the same
 * count, so a writer who moves between scenes still gets automatic snapshots.
 */
const activeByItem = new Map<string, Set<number>>();

/** The active minutes counted so far for an item. */
export function activeMinutesOf(itemId: string): Set<number> {
  let active = activeByItem.get(itemId);
  if (!active) {
    active = new Set();
    activeByItem.set(itemId, active);
  }
  return active;
}

export interface AutoSnapshotOptions {
  doc: Y.Doc;
  /** The active minutes counted so far. Pass `activeMinutesOf(itemId)` so the count outlives the editor. */
  active: Set<number>;
  /** Origins whose updates are not the writer's editing, such as the database load or another tab. */
  ignoreOrigins: readonly unknown[];
  everyMinutes: number;
  /** The item's current text, or null while the editor is not ready. */
  readText: () => string | null;
  /** The text of the item's newest snapshot, or null when it has none. */
  latestText: () => Promise<string | null>;
  save: (text: string) => Promise<unknown>;
  /** Called when an automatic snapshot could not be saved. The minutes stay counted for the next try. */
  onError?: (error: unknown) => void;
  /** The check waits for this pause in editing, so it never runs between keystrokes. */
  checkDelayMs?: number;
}

/**
 * Saves a snapshot after `everyMinutes` active minutes, and only when the text changed since the newest
 * snapshot. A minute is active when the writer changed the item in it. Returns a function that stops it.
 */
export function watchActiveMinutes(options: AutoSnapshotOptions): () => void {
  const {
    doc,
    active,
    ignoreOrigins,
    everyMinutes,
    readText,
    latestText,
    save,
    onError,
    checkDelayMs = 2000,
  } = options;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let stopped = false;
  let busy = false;
  // A function, so the type checker does not assume the flag stays as it was before an await.
  const isStopped = () => stopped;

  const check = async () => {
    if (busy || stopped || active.size < everyMinutes) return;
    busy = true;
    try {
      const last = await latestText();
      if (isStopped()) return;
      // Read after the await, so the text matches the document state that save() stores at once.
      const text = readText();
      if (text === null) return;
      if (text !== last && (last !== null || text.trim() !== '')) await save(text);
      // Cleared only after a save worked, or when there was nothing new to save.
      active.clear();
    } finally {
      busy = false;
    }
  };

  const onUpdate = (_update: Uint8Array, origin: unknown) => {
    if (ignoreOrigins.includes(origin)) return;
    active.add(Math.floor(clock.now() / MINUTE_MS));
    if (timer !== null) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      void check().catch((error: unknown) => {
        onError?.(error);
      });
    }, checkDelayMs);
  };

  doc.on('update', onUpdate);
  return () => {
    stopped = true;
    if (timer !== null) clearTimeout(timer);
    doc.off('update', onUpdate);
  };
}
