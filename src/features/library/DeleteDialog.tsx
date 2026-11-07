import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { shareState } from '@/features/share/state';
import { db, type Project } from '@/lib/db';
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
  const projectId = project?.id ?? null;
  // Deleting the project removes the owner tokens, so the writer could not stop these links after it.
  const activeLinks = useLiveQuery(
    async () =>
      projectId === null
        ? 0
        : (await db.shares.where('projectId').equals(projectId).toArray()).filter(
            (r) => shareState(r) === 'active',
          ).length,
    [projectId],
    0,
  );

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
          {activeLinks > 0 && (
            <p className="text-sm">
              {activeLinks === 1
                ? 'This project has 1 active share link.'
                : `This project has ${String(activeLinks)} active share links.`}{' '}
              Readers can open {activeLinks === 1 ? 'it' : 'them'} until{' '}
              {activeLinks === 1 ? 'it expires' : 'they expire'}. To stop {activeLinks === 1 ? 'it' : 'them'}{' '}
              now, cancel, open the project and choose Share, then Stop sharing.
            </p>
          )}
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
