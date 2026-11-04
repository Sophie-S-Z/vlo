import { cn } from '@/ui/cn';
import { SAVE_MESSAGES, type SaveState } from './saveTracker';

/**
 * The save state. The check mark draws after the writer pauses (a CSS stroke transition, instant under
 * Calm mode). The live region speaks "Saved" and errors, never "Saving", so typing stays quiet.
 */
export function SaveStatus({ state }: { state: SaveState }) {
  const error = state === 'error' || state === 'error-quota';
  return (
    <div className={cn('flex min-h-6 items-center gap-2 text-sm', error ? 'text-accent-text' : 'text-muted')}>
      {!error && (
        <svg aria-hidden="true" viewBox="0 0 16 16" className="size-4">
          <path
            d="M3 8.5l3.2 3L13 4.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            pathLength={1}
            strokeDasharray={1}
            strokeDashoffset={state === 'saved' ? 0 : 1}
            className={cn(
              state === 'saved' && 'transition-[stroke-dashoffset] duration-500 ease-[var(--ease-reveal)]',
            )}
          />
        </svg>
      )}
      {/* On a phone only the check mark shows, so the row does not jump on each save. */}
      {state === 'saving' && (
        <span aria-hidden="true" className="max-sm:hidden">
          Saving
        </span>
      )}
      <span role="status" aria-live="polite" className={cn(state === 'saved' && 'sr-only sm:not-sr-only')}>
        {state === 'saving' ? '' : SAVE_MESSAGES[state]}
      </span>
    </div>
  );
}
