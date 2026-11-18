import { Lightbulb, X } from 'lucide-react';
import { useSyncExternalStore } from 'react';
import { safeStorage } from '@/app/preferences';
import { shortcutLabel } from '@/features/editor/commands/keys';
import { Button } from '@/ui/button';
import { ICON_BUTTON } from '@/ui/tip';

/*
 * The getting-started guide (beta feedback, after Phase 17 decision S5). Many writers know Word or Google
 * Docs and not much else, so a short line above the text shows the basics, one step at a time. Back and
 * Next move through the steps, and Done or Close hides the guide for good. Settings can show it again.
 */

export const GUIDE_KEY = 'vlo:guide';

export function guideSteps(apple?: boolean): string[] {
  return [
    'Click the page and type. Vlo saves each change on this device, so you never need a Save button.',
    'The binder lists your chapters, scenes, poems and notes. Click one to open it, or choose Add for a new one.',
    'The bar above the text has bold, italic and headings, as in Word or Google Docs. Select words for a small menu with links and comments.',
    `Press ${shortcutLabel('Mod-k', apple)} or choose Search to find any tool, view or item by name.`,
    'In prose, Page look (next to the word count) makes the text wider or narrower on your screen.',
    'Vlo uses no AI unless you turn it on, and it keeps a signed record of how you wrote. Help, at the bottom of the page, has the full guide.',
  ];
}

interface GuideState {
  closed: boolean;
  index: number;
}

const listeners = new Set<() => void>();
let cached: { raw: string | null; state: GuideState } | null = null;

function read(): GuideState {
  let raw: string | null = null;
  try {
    raw = safeStorage()?.getItem(GUIDE_KEY) ?? null;
  } catch {
    raw = null;
  }
  if (cached?.raw === raw) return cached.state;
  let state: GuideState = { closed: false, index: 0 };
  try {
    const data = raw === null ? null : (JSON.parse(raw) as Partial<GuideState>);
    if (data && typeof data === 'object')
      state = {
        closed: data.closed === true,
        index: typeof data.index === 'number' && data.index >= 0 ? Math.floor(data.index) : 0,
      };
  } catch {
    // A damaged value starts the guide again.
  }
  cached = { raw, state };
  return state;
}

function write(state: GuideState): void {
  try {
    safeStorage()?.setItem(GUIDE_KEY, JSON.stringify(state));
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

/** Shows the guide again from the first step (Settings). */
export function showGuideAgain(): void {
  write({ closed: false, index: 0 });
}

export function useGuide(): GuideState {
  return useSyncExternalStore(subscribe, read, () => ({ closed: true, index: 0 }));
}

export function Guide() {
  const state = useGuide();
  if (state.closed) return null;
  const steps = guideSteps();
  const last = steps.length - 1;
  const index = Math.min(state.index, last);
  return (
    <aside
      aria-label="Getting started"
      data-typing-hide
      className="flex flex-wrap items-center gap-x-2 rounded-md border border-rule bg-surface py-1 pr-1 pl-3 text-sm text-muted"
    >
      <Lightbulb aria-hidden="true" className="size-4 shrink-0 text-accent-text" />
      <p className="min-w-0 flex-1 basis-60 py-2" aria-live="polite">
        <span className="tabular-nums text-text">
          Step {index + 1} of {steps.length}.
        </span>{' '}
        {steps[index]}
      </p>
      <div className="ml-auto flex items-center">
        {index > 0 && (
          <Button
            variant="ghost"
            className="min-h-11 px-3 pointer-fine:min-h-9"
            onClick={() => {
              write({ closed: false, index: index - 1 });
            }}
          >
            Back
          </Button>
        )}
        <Button
          variant="ghost"
          className="min-h-11 px-3 text-text pointer-fine:min-h-9"
          onClick={() => {
            write(index === last ? { closed: true, index } : { closed: false, index: index + 1 });
          }}
        >
          {index === last ? 'Done' : 'Next'}
        </Button>
        <Button
          variant="ghost"
          className={ICON_BUTTON}
          data-tip="Close the guide"
          data-tip-align="end"
          onClick={() => {
            write({ closed: true, index });
          }}
        >
          <X aria-hidden="true" className="size-4" />
          <span className="sr-only">Close the guide</span>
        </Button>
      </div>
    </aside>
  );
}
