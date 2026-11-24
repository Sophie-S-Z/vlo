import type * as Y from 'yjs';

export type SaveState = 'saved' | 'saving' | 'error-quota' | 'error';

export const SAVE_PAUSE_MS = 600;

export const SAVE_MESSAGES: Record<SaveState, string> = {
  saved: 'Saved',
  saving: 'Saving',
  'error-quota': 'Vlo could not save. Your device storage is full.',
  error: 'Vlo could not save. Reload Vlo and try again.',
};

interface SaveTrackerOptions {
  doc: Y.Doc;
  /** Origins whose updates are not the writer's typing, such as the database load or another tab. */
  ignoreOrigins: readonly unknown[];
  /** Resolves once IndexedDB holds every update so far. */
  confirm: () => Promise<void>;
  /** Runs after the pause, before the confirm, for work such as the text copy and word count. */
  onPause?: () => Promise<void>;
  onState: (state: SaveState) => void;
  pauseMs?: number;
}

function isQuota(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'QuotaExceededError';
}

/**
 * Watches a document. "Saving" on each change, "Saved" once the writer pauses and IndexedDB confirms. From
 * a failed save until a save works, the browser asks before the tab closes.
 */
export function trackSaves(options: SaveTrackerOptions): () => void {
  const { doc, ignoreOrigins, confirm, onPause, onState, pauseMs = SAVE_PAUSE_MS } = options;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let generation = 0;
  let stopped = false;

  // While a save fails, the browser asks before the tab closes, as the words are only in memory.
  const askBeforeClose = (event: BeforeUnloadEvent) => {
    event.preventDefault();
  };
  const report = (state: SaveState) => {
    if (state === 'saved') window.removeEventListener('beforeunload', askBeforeClose);
    else if (state !== 'saving') window.addEventListener('beforeunload', askBeforeClose);
    onState(state);
  };

  const settle = async (mine: number) => {
    try {
      await onPause?.();
      await confirm();
      if (!stopped && mine === generation) report('saved');
    } catch (error) {
      if (!stopped && mine === generation) report(isQuota(error) ? 'error-quota' : 'error');
    }
  };

  const onUpdate = (_update: Uint8Array, origin: unknown) => {
    if (ignoreOrigins.includes(origin)) return;
    generation += 1;
    onState('saving');
    if (timer !== null) clearTimeout(timer);
    const mine = generation;
    timer = setTimeout(() => {
      timer = null;
      void settle(mine);
    }, pauseMs);
  };

  // A tab that closes during the pause never runs the timer. Write the text copy and counts when the page hides.
  const flush = (event: Event) => {
    if (timer === null) return;
    if (event.type !== 'pagehide' && document.visibilityState !== 'hidden') return;
    clearTimeout(timer);
    timer = null;
    void settle(generation);
  };
  doc.on('update', onUpdate);
  document.addEventListener('visibilitychange', flush);
  window.addEventListener('pagehide', flush);
  return () => {
    stopped = true;
    window.removeEventListener('beforeunload', askBeforeClose);
    document.removeEventListener('visibilitychange', flush);
    window.removeEventListener('pagehide', flush);
    doc.off('update', onUpdate);
    // Leaving during the pause still writes the text copy and the counts.
    if (timer !== null) {
      clearTimeout(timer);
      void onPause?.().catch(() => undefined);
    }
  };
}
