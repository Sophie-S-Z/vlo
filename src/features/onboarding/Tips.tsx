import { Lightbulb, X } from 'lucide-react';
import { useSyncExternalStore } from 'react';
import { safeStorage } from '@/app/preferences';
import { shortcutLabel } from '@/features/editor/commands/keys';
import { Button } from '@/ui/button';
import { ICON_BUTTON } from '@/ui/tip';

/*
 * First-use tips (Phase 17 decision S5). The screen shows few tools, so one quiet line names the ways to the
 * rest: the command menu, the / menu, the selection menu, the icon names and the More views. "Next tip"
 * shows the next one. Close hides the line for good, and Settings can show it again.
 */

export const TIPS_KEY = 'vlo:tips';

export function tipLines(apple?: boolean): string[] {
  return [
    `Press ${shortcutLabel('Mod-k', apple)} or choose Search to find any tool, view or item by name.`,
    'Type / in the text for headings, lists, footnotes, images, citations and more.',
    'Select words to see a small menu for bold, links and comments.',
    'Point at an icon, or move to it with Tab, to see its name.',
    'The More tab holds the Outline, the Codex, Feedback, Book, Submissions and Progress.',
  ];
}

interface TipState {
  closed: boolean;
  index: number;
}

const listeners = new Set<() => void>();
let cached: { raw: string | null; state: TipState } | null = null;

function read(): TipState {
  let raw: string | null = null;
  try {
    raw = safeStorage()?.getItem(TIPS_KEY) ?? null;
  } catch {
    raw = null;
  }
  if (cached?.raw === raw) return cached.state;
  let state: TipState = { closed: false, index: 0 };
  try {
    const data = raw === null ? null : (JSON.parse(raw) as Partial<TipState>);
    if (data && typeof data === 'object')
      state = {
        closed: data.closed === true,
        index: typeof data.index === 'number' && data.index >= 0 ? Math.floor(data.index) : 0,
      };
  } catch {
    // A damaged value starts the tips again.
  }
  cached = { raw, state };
  return state;
}

function write(state: TipState): void {
  try {
    safeStorage()?.setItem(TIPS_KEY, JSON.stringify(state));
  } catch {
    // Blocked storage: the change holds for this visit only.
    cached = { raw: JSON.stringify(state), state };
  }
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Shows the tips again from the first one (Settings). */
export function showTipsAgain(): void {
  write({ closed: false, index: 0 });
}

export function useTips(): TipState {
  return useSyncExternalStore(subscribe, read, () => ({ closed: true, index: 0 }));
}

export function Tips() {
  const state = useTips();
  if (state.closed) return null;
  const lines = tipLines();
  const index = state.index % lines.length;
  return (
    <aside
      aria-label="Tip"
      className="flex items-center gap-2 rounded-md border border-rule bg-surface py-1 pr-1 pl-3 text-sm text-muted"
    >
      <Lightbulb aria-hidden="true" className="size-4 shrink-0 text-accent-text" />
      <p className="min-w-0 flex-1" aria-live="polite">
        {lines[index]}
      </p>
      <Button
        variant="ghost"
        className="min-h-11 px-3 pointer-fine:min-h-9"
        onClick={() => {
          write({ closed: false, index: index + 1 });
        }}
      >
        Next tip
      </Button>
      <Button
        variant="ghost"
        className={ICON_BUTTON}
        data-tip="Close the tips"
        data-tip-align="end"
        onClick={() => {
          write({ closed: true, index });
        }}
      >
        <X aria-hidden="true" className="size-4" />
        <span className="sr-only">Close the tips</span>
      </Button>
    </aside>
  );
}
