import { Plus } from 'lucide-react';
import { useId, useState } from 'react';
import { useNavigate } from 'react-router';
import type { Template } from '@/lib/db';
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
import { TemplatePicker } from './TemplatePicker';
import { TEMPLATES } from './templates';

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
          <TemplatePicker value={template} onChange={setTemplate} />
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
