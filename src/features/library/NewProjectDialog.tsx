import { Plus } from 'lucide-react';
import { lazy, Suspense, useId, useState } from 'react';
import { useNavigate } from 'react-router';
import { Button } from '@/ui/button';
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
import { TemplatePicker, useTemplatePick } from './TemplatePicker';
import { FIRST_STRUCTURE } from './firstStructure';
import { projectDef } from './templates';

const StructurePicker = lazy(async () => ({
  default: (await import('./StructurePicker')).StructurePicker,
}));
import type { Template } from '@/lib/db';

export function NewProjectDialog() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const { pick, toggle, reset } = useTemplatePick();
  // null keeps the templates' default title, so a template change updates it until the writer types.
  const [title, setTitle] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // The structure of each picked mode that has structures. Absent means the first one.
  const [structures, setStructures] = useState<Partial<Record<Template, string>>>({});
  const titleId = useId();
  const errorId = useId();
  const shownTitle = title ?? projectDef(pick.value).untitled;

  function changeOpen(next: boolean) {
    setOpen(next);
    if (!next) {
      reset();
      setTitle(null);
      setError(null);
      setStructures({});
    }
  }

  async function submit() {
    if (shownTitle.trim() === '') {
      setError('A project needs a title.');
      return;
    }
    setBusy(true);
    try {
      const chosen: Partial<Record<Template, string>> = {};
      for (const template of pick.value) {
        const id = structures[template] ?? FIRST_STRUCTURE[template];
        if (id) chosen[template] = id;
      }
      const { project, firstItemId } = await createProject({
        title: shownTitle,
        templates: pick.value,
        structures: chosen,
      });
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
        <DialogDescription>You can rename the project at any time.</DialogDescription>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
          className="grid gap-6"
        >
          <TemplatePicker pick={pick} onToggle={toggle} label="What do you write?" />
          {pick.value
            .filter((template) => FIRST_STRUCTURE[template] !== undefined)
            .map((template) => (
              <Suspense key={template} fallback={<div className="min-h-24" />}>
                <StructurePicker
                  template={template}
                  value={structures[template] ?? FIRST_STRUCTURE[template] ?? ''}
                  onChange={(id) => {
                    setStructures((prev) => ({ ...prev, [template]: id }));
                  }}
                />
              </Suspense>
            ))}
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
