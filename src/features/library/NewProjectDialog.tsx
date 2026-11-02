import { BookOpen, Feather, Hourglass, Plus, type LucideIcon } from 'lucide-react';
import { RadioGroup as RadioGroupPrimitive } from 'radix-ui';
import { useId, useState } from 'react';
import { useNavigate } from 'react-router';
import type { Template } from '@/lib/db';
import { Button } from '@/ui/button';
import { cn } from '@/ui/cn';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from '@/ui/dialog';
import { Input } from '@/ui/input';
import { Label } from '@/ui/label';
import { createProject } from './projects';
import { TEMPLATE_ORDER, TEMPLATES } from './templates';

const ICONS: Record<Template, LucideIcon> = { novel: BookOpen, memoir: Hourglass, poetry: Feather };

/* The three cards lean apart like a hand of cards on wider screens. Calm mode and reduced motion keep them flat. */
const FAN: Record<Template, string> = {
  novel: 'sm:-rotate-3 sm:translate-y-2',
  memoir: 'sm:-translate-y-1',
  poetry: 'sm:rotate-3 sm:translate-y-2',
};

export function NewProjectDialog() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [template, setTemplate] = useState<Template>('novel');
  // null keeps the template's default title, so a template change updates it until the writer types.
  const [title, setTitle] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const titleId = useId();
  const errorId = useId();
  const shownTitle = title ?? TEMPLATES[template].untitled;

  function changeOpen(next: boolean) {
    setOpen(next);
    if (!next) {
      setTemplate('novel');
      setTitle(null);
      setError(null);
    }
  }

  async function submit() {
    if (shownTitle.trim() === '') {
      setError('A project needs a title.');
      return;
    }
    setBusy(true);
    try {
      const { project, firstItemId } = await createProject({ title: shownTitle, template });
      await navigate(`/p/${project.id}?item=${firstItemId}`);
    } catch {
      setError('Vlo could not save the project on this device. Check that the browser allows site data.');
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus aria-hidden="true" className="size-4" />
          New project
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogTitle>New project</DialogTitle>
        <DialogDescription>Pick a shape. You can rename the project at any time.</DialogDescription>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
          className="grid gap-6"
        >
          <RadioGroupPrimitive.Root
            aria-label="Template"
            value={template}
            onValueChange={(value) => {
              setTemplate(value as Template);
            }}
            orientation="horizontal"
            className="grid gap-3 sm:grid-cols-3 sm:gap-4 sm:px-2 sm:pt-2 sm:pb-4"
          >
            {TEMPLATE_ORDER.map((id) => {
              const def = TEMPLATES[id];
              const Icon = ICONS[id];
              return (
                <RadioGroupPrimitive.Item
                  key={id}
                  value={id}
                  aria-describedby={`${titleId}-${id}`}
                  className={cn(
                    'flex flex-col items-start gap-2 rounded-[var(--radius-card)] border border-rule bg-bg p-4 text-left transition-[transform,border-color,box-shadow] duration-500 ease-[var(--ease-reveal)]',
                    'hover:shadow-[var(--shadow-hover)] data-[state=checked]:border-accent data-[state=checked]:shadow-[inset_0_0_0_1px_var(--accent)]',
                    FAN[id],
                    'sm:hover:translate-y-0 sm:hover:rotate-0 motion-reduce:transform-none in-[[data-calm=true]]:transform-none',
                  )}
                >
                  <Icon aria-hidden="true" className="size-6 text-accent-text" />
                  <span className="font-display text-lg font-semibold">{def.label}</span>
                  <span id={`${titleId}-${id}`} className="text-sm text-muted">
                    {def.description}
                  </span>
                </RadioGroupPrimitive.Item>
              );
            })}
          </RadioGroupPrimitive.Root>
          <div className="grid gap-2">
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
          <div className="flex flex-wrap justify-end gap-2">
            <DialogClose asChild>
              <Button type="button" variant="ghost">
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" disabled={busy}>
              Create project
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
