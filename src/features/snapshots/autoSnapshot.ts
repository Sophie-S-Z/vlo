import type * as Y from 'yjs';
import { clock } from '@/lib/clock';

const MINUTE_MS = 60_000;

export interface AutoSnapshotOptions {
  doc: Y.Doc;
  /** Origins whose updates are not the writer's editing, such as the database load or another tab. */
  ignoreOrigins: readonly unknown[];
  everyMinutes: number;
  /** The item's current text, or null while the editor is not ready. */
  readText: () => string | null;
  /** The text of the item's newest snapshot, or null when it has none. */
  latestText: () => Promise<string | null>;
  save: (text: string) => Promise<unknown>;
  /** The check waits for this pause in editing, so it never runs between keystrokes. */
  checkDelayMs?: number;
}

/**
 * Saves a snapshot after `everyMinutes` active minutes, and only when the text changed since the newest
 * snapshot. A minute is active when the writer changed the item in it. Returns a function that stops it.
 */
export function watchActiveMinutes(options: AutoSnapshotOptions): () => void {
  const { doc, ignoreOrigins, everyMinutes, readText, latestText, save, checkDelayMs = 2000 } = options;
  const active = new Set<number>();
  let timer: ReturnType<typeof setTimeout> | null = null;
  let stopped = false;
  let busy = false;
  // A function, so the type checker does not assume the flag stays as it was before an await.
  const isStopped = () => stopped;

  const check = async () => {
    if (busy || stopped || active.size < everyMinutes) return;
    busy = true;
    try {
      const text = readText();
      if (text === null) return;
      const last = await latestText();
      if (isStopped()) return;
      active.clear();
      if (text !== last && (last !== null || text.trim() !== '')) await save(text);
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
      void check().catch(() => undefined);
    }, checkDelayMs);
  };

  doc.on('update', onUpdate);
  return () => {
    stopped = true;
    if (timer !== null) clearTimeout(timer);
    doc.off('update', onUpdate);
  };
}
