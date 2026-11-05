import { useRef } from 'react';
import type { Project } from '@/lib/db';
import { cn } from '@/ui/cn';
import { ModeDialog } from './ModeDialog';
import { ModeIcon } from './ModeIcon';
import { MODE_INFO } from './modes';

/*
 * The AI mode badge (spec section 10, F23). It shows on every project screen, next to the view tabs, and
 * opens the mode dialog. Pen is quiet. Reader has the accent line, and Co-writer is filled, so a writer
 * sees at a glance how much AI the project allows.
 */

const TONE = {
  pen: 'border-rule text-muted group-hover:border-muted group-hover:text-text',
  reader: 'border-accent text-accent-text group-hover:bg-surface',
  cowriter: 'border-accent bg-accent text-on-accent group-hover:shadow-[var(--shadow-hover)]',
} as const;

export function ModeBadge({
  project,
  open,
  onOpenChange,
}: {
  project: Project;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const mode = project.aiMode;
  const buttonRef = useRef<HTMLButtonElement>(null);
  return (
    <>
      {/* The button is 44 px tall for a finger. The pill inside it is the part that shows. */}
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="dialog"
        data-testid="mode-badge"
        data-mode={mode}
        onClick={() => {
          onOpenChange(true);
        }}
        className="group inline-flex min-h-11 shrink-0 items-center rounded-full"
      >
        <span
          className={cn(
            'inline-flex min-h-8 items-center gap-1.5 rounded-full border px-3 text-sm font-medium whitespace-nowrap transition-colors',
            TONE[mode],
          )}
        >
          <ModeIcon mode={mode} className="size-[18px]" />
          <span>
            <span className="sr-only">AI mode: </span>
            {MODE_INFO[mode].label}
          </span>
        </span>
      </button>
      {open && (
        <ModeDialog project={project} open={open} onOpenChange={onOpenChange} returnFocus={buttonRef} />
      )}
    </>
  );
}
