import { useId, useState } from 'react';
import type { Project } from '@/lib/db';
import { Button } from '@/ui/button';
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from '@/ui/dialog';
import { Input } from '@/ui/input';
import { Label } from '@/ui/label';
import { renameProject } from './projects';

interface RenameDialogProps {
  project: Project | null;
  onClose: () => void;
}

export function RenameDialog({ project, onClose }: RenameDialogProps) {
  return (
    <Dialog
      open={project !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      {project !== null && (
        <DialogContent>
          <DialogTitle>Rename project</DialogTitle>
          <DialogDescription>The new title shows in the Library and in exports.</DialogDescription>
          <RenameForm key={project.id} project={project} onDone={onClose} />
        </DialogContent>
      )}
    </Dialog>
  );
}

function RenameForm({ project, onDone }: { project: Project; onDone: () => void }) {
  const [title, setTitle] = useState(project.title);
  const [error, setError] = useState<string | null>(null);
  const inputId = useId();
  const errorId = useId();

  async function submit() {
    if (title.trim() === '') {
      setError('A project needs a title.');
      return;
    }
    try {
      await renameProject(project.id, title);
      onDone();
    } catch {
      setError('Vlo could not save the new title on this device.');
    }
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
      className="grid gap-6"
    >
      <div className="grid gap-2">
        <Label htmlFor={inputId}>Title</Label>
        <Input
          id={inputId}
          value={title}
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
        <Button type="submit">Save</Button>
      </div>
    </form>
  );
}
