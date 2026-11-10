import { PenLine } from 'lucide-react';
import { RadioGroup as RadioGroupPrimitive } from 'radix-ui';
import { useEffect, useId, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { createProject } from '@/features/library/projects';
import { TemplatePicker, useTemplatePick } from '@/features/library/TemplatePicker';
import { projectDef } from '@/features/library/templates';
import { Button } from '@/ui/button';
import { Input } from '@/ui/input';
import { Label } from '@/ui/label';
import { markOnboarded } from './firstVisit';
import { HoldButton } from './HoldButton';
import { MotionViewTransition } from '@/ui/MotionViewTransition';
import { useDocumentTitle } from '@/app/useDocumentTitle';

const STEPS = ['What do you write?', 'Your words stay yours', 'Name it'] as const;

export function WelcomePage() {
  useDocumentTitle('Welcome');
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const { pick, toggle } = useTemplatePick();
  // null keeps the templates' default title until the writer types.
  const [title, setTitle] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const firstRender = useRef(true);
  const titleId = useId();
  const errorId = useId();
  const shownTitle = title ?? projectDef(pick.value).untitled;

  // Each new step moves focus to its heading, so a screen reader reads where the writer is.
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    headingRef.current?.focus();
  }, [step]);

  async function skip() {
    try {
      await markOnboarded();
    } finally {
      await navigate('/');
    }
  }

  async function open(): Promise<boolean> {
    if (shownTitle.trim() === '') {
      setError('A project needs a title.');
      return false;
    }
    try {
      const { project, firstItemId } = await createProject({ title: shownTitle, templates: pick.value });
      await markOnboarded();
      await navigate(`/p/${project.id}?item=${firstItemId}`);
      return true;
    } catch {
      setError('Vlo could not save the project on this device. Check that the browser allows site data.');
      return false;
    }
  }

  return (
    <MotionViewTransition exit="vlo-zoom-through">
      <div className="grain flex min-h-dvh flex-col">
        <header className="mx-auto flex w-full max-w-3xl items-center justify-between gap-4 px-4 py-3">
          <span className="font-display text-2xl font-semibold [font-variation-settings:'SOFT'_50,'opsz'_72]">
            Vlo
          </span>
          <Button variant="ghost" onClick={() => void skip()}>
            Skip
          </Button>
        </header>
        <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center px-4 py-8">
          <p className="tabular-nums text-sm text-muted">Step {step + 1} of 3</p>
          <h1
            ref={headingRef}
            tabIndex={-1}
            className="mt-2 font-display text-4xl font-semibold outline-none sm:text-5xl"
          >
            {STEPS[step]}
          </h1>

          {step === 0 && (
            <div className="mt-8">
              <TemplatePicker pick={pick} onToggle={toggle} label="What do you write?" />
            </div>
          )}

          {step === 1 && (
            <div className="mt-8 max-w-xl">
              <RadioGroupPrimitive.Root aria-label="Writing mode" value="pen">
                <RadioGroupPrimitive.Item
                  value="pen"
                  aria-describedby={`${titleId}-pen`}
                  className="flex w-full items-start gap-4 rounded-[var(--radius-card)] border border-accent bg-surface p-5 text-left shadow-[inset_0_0_0_1px_var(--accent)]"
                >
                  <PenLine aria-hidden="true" className="mt-1 size-6 shrink-0 text-accent-text" />
                  <span className="grid gap-1">
                    <span className="font-display text-xl font-semibold">Pen</span>
                    <span id={`${titleId}-pen`} className="text-muted">
                      Your words stay on this device. No AI is on.
                    </span>
                  </span>
                </RadioGroupPrimitive.Item>
              </RadioGroupPrimitive.Root>
            </div>
          )}

          {step === 2 && (
            <div className="mt-8 grid max-w-xl gap-2">
              <Label htmlFor={titleId}>Title</Label>
              <Input
                id={titleId}
                value={shownTitle}
                onChange={(event) => {
                  setTitle(event.target.value);
                  setError(null);
                }}
                aria-invalid={error !== null}
                aria-describedby={error === null ? undefined : errorId}
                autoComplete="off"
              />
              {error !== null && (
                <p id={errorId} role="alert" className="text-sm text-accent-text">
                  {error}
                </p>
              )}
            </div>
          )}

          <div className="mt-10 flex flex-wrap items-center gap-3">
            {step > 0 && (
              <Button
                variant="ghost"
                onClick={() => {
                  setStep(step - 1);
                }}
              >
                Back
              </Button>
            )}
            {step < 2 ? (
              <Button
                onClick={() => {
                  setStep(step + 1);
                }}
                className="min-h-12 px-6 text-base"
              >
                Next
              </Button>
            ) : (
              <HoldButton
                label="Hold to open your first page"
                plainLabel="Open your first page"
                onConfirm={open}
              />
            )}
          </div>
        </main>
      </div>
    </MotionViewTransition>
  );
}
