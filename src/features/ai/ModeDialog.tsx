import { RadioGroup as RadioGroupPrimitive } from 'radix-ui';
import { useId, useState, type RefObject } from 'react';
import { Link } from 'react-router';
import { useWritingPrefs } from '@/features/editor/writingPrefs';
import type { AiMode, Project } from '@/lib/db';
import { Button } from '@/ui/button';
import { cn } from '@/ui/cn';
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from '@/ui/dialog';
import { ModeIcon } from './ModeIcon';
import { changesFor, MODE_INFO, MODES, setAiMode } from './modes';

/*
 * The mode dialog (spec section 10, F23). The writer picks a mode, and the dialog lists what will change
 * before the switch. The switch happens only on the button, so a change away from Pen is always a
 * confirmed choice. Reader and Drafting show only after the writer turns on AI modes in Settings, or while
 * the project is in one of them, so a writer can always go back to Pen.
 */

export function ModeDialog({
  project,
  open,
  onOpenChange,
  returnFocus,
}: {
  project: Project;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The badge. The dialog has no Radix trigger, so focus goes back to it by hand. */
  returnFocus: RefObject<HTMLButtonElement | null>;
}) {
  const id = useId();
  const [chosen, setChosen] = useState<AiMode>(project.aiMode);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const current = project.aiMode;
  const offered = useWritingPrefs().aiModes || current !== 'pen' ? MODES : (['pen'] as const);
  const changes = changesFor(chosen, {
    templates: project.templates,
    aliasAiRequests: project.settings.aliasAiRequests,
  });

  const confirm = () => {
    setSaving(true);
    setAiMode(project.id, chosen).then(
      () => {
        setSaving(false);
        onOpenChange(false);
      },
      () => {
        setSaving(false);
        setError('Vlo could not save the mode on this device.');
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-xl"
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          returnFocus.current?.focus();
        }}
      >
        <div className="grid gap-1">
          <DialogTitle>AI mode</DialogTitle>
          <DialogDescription>
            Each project has its own mode. {project.title} is in {MODE_INFO[current].label} mode.
          </DialogDescription>
        </div>

        <RadioGroupPrimitive.Root
          aria-label="AI mode"
          value={chosen}
          onValueChange={(value) => {
            setChosen(value as AiMode);
            setError('');
          }}
          className="grid gap-2"
        >
          {offered.map((mode) => (
            <RadioGroupPrimitive.Item
              key={mode}
              value={mode}
              aria-describedby={`${id}-${mode}`}
              className={cn(
                'flex items-start gap-3 rounded-[var(--radius-card)] border border-rule bg-bg p-3 text-left outline-none',
                'focus-visible:ring-2 focus-visible:ring-accent data-[state=checked]:border-accent data-[state=checked]:shadow-[inset_0_0_0_1px_var(--accent)]',
              )}
            >
              <ModeIcon mode={mode} className="mt-0.5 size-6 text-accent-text" />
              <span className="grid gap-0.5">
                <span className="font-display text-lg font-semibold">
                  {MODE_INFO[mode].label}
                  {mode === current && <span className="font-ui text-sm font-normal text-muted"> (now)</span>}
                </span>
                <span id={`${id}-${mode}`} className="text-sm text-muted">
                  {MODE_INFO[mode].summary}
                </span>
              </span>
            </RadioGroupPrimitive.Item>
          ))}
        </RadioGroupPrimitive.Root>
        {offered.length === 1 && (
          <p className="text-sm text-muted">
            AI modes are off. To use AI in a project, turn on Offer AI modes in{' '}
            <Link to="/settings#ai" className="underline">
              Settings
            </Link>
            . Vlo marks each AI word and counts it in the authorship record.
          </p>
        )}

        {chosen !== current && (
          <section aria-labelledby={`${id}-changes`} className="grid gap-2" data-testid="mode-changes">
            <h3 id={`${id}-changes`} className="text-sm font-semibold">
              What changes in {MODE_INFO[chosen].label} mode
            </h3>
            <ul className="grid list-disc gap-1.5 pl-5 text-sm">
              {changes.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </section>
        )}

        <p role="alert" className="text-sm text-accent-text empty:hidden">
          {error}
        </p>

        <div className="flex flex-wrap justify-end gap-2">
          <DialogClose asChild>
            <Button variant="outline">{chosen === current ? 'Close' : 'Cancel'}</Button>
          </DialogClose>
          {chosen !== current && (
            <Button onClick={confirm} disabled={saving}>
              Switch to {MODE_INFO[chosen].label} mode
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
