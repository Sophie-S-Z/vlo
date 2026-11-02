import { useState } from 'react';
import type { Project } from '@/lib/db';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
} from '@/ui/alert-dialog';
import { Button } from '@/ui/button';
import { deleteProject } from './projects';

interface DeleteDialogProps {
  project: Project | null;
  onClose: () => void;
}

export function DeleteDialog({ project, onClose }: DeleteDialogProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirm(id: string) {
    setBusy(true);
    try {
      await deleteProject(id);
      setError(null);
      onClose();
    } catch {
      setError('Vlo could not delete the project. Reload Vlo and try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <AlertDialog
      open={project !== null}
      onOpenChange={(open) => {
        if (!open) {
          setError(null);
          onClose();
        }
      }}
    >
      {project !== null && (
        <AlertDialogContent>
          <AlertDialogTitle className="[overflow-wrap:anywhere]">Delete {project.title}?</AlertDialogTitle>
          <AlertDialogDescription>This removes it from this device.</AlertDialogDescription>
          {error !== null && (
            <p role="alert" className="text-sm text-accent-text">
              {error}
            </p>
          )}
          <div className="flex flex-wrap justify-end gap-2">
            <AlertDialogCancel asChild>
              <Button variant="ghost">Cancel</Button>
            </AlertDialogCancel>
            <Button
              disabled={busy}
              onClick={() => {
                void confirm(project.id);
              }}
            >
              Delete project
            </Button>
          </div>
        </AlertDialogContent>
      )}
    </AlertDialog>
  );
}
