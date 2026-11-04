import { useId, useState } from 'react';
import { useAudioFiles } from '@/features/sound/library';
import { formatBytes } from '@/lib/bytes';
import type { Project } from '@/lib/db';
import { downloadBytes } from '@/lib/download';
import { Button } from '@/ui/button';
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from '@/ui/dialog';
import { Switch } from '@/ui/switch';

/*
 * The backup dialog (spec section 9, plan Task B8): one file with the whole project, and the writer's
 * music only when the writer asks for it, because music files are large.
 */

type Status =
  | { step: 'choose' }
  | { step: 'working' }
  | { step: 'done'; name: string; bytes: Uint8Array }
  | { step: 'error' };

interface BackupDialogProps {
  /** The project to back up, or null when the dialog is closed. */
  project: Project | null;
  onClose: () => void;
}

export function BackupDialog({ project, onClose }: BackupDialogProps) {
  const [status, setStatus] = useState<Status>({ step: 'choose' });
  const [music, setMusic] = useState(false);
  const files = useAudioFiles() ?? [];
  const ids = useId();
  const musicSize = files.reduce((sum, file) => sum + file.size, 0);

  function close() {
    setStatus({ step: 'choose' });
    setMusic(false);
    onClose();
  }

  async function backUp(projectId: string) {
    setStatus({ step: 'working' });
    try {
      const { backUpProject } = await import('./backup');
      const file = await backUpProject(projectId, { music: music && files.length > 0 });
      downloadBytes(file.name, 'application/zip', file.bytes);
      setStatus({ step: 'done', ...file });
    } catch {
      setStatus({ step: 'error' });
    }
  }

  return (
    <Dialog
      open={project !== null}
      onOpenChange={(open) => {
        if (!open) close();
      }}
    >
      {project !== null && (
        <DialogContent className="max-w-lg" aria-busy={status.step === 'working'}>
          {status.step === 'done' ? (
            <>
              <DialogTitle>Your backup is ready</DialogTitle>
              <DialogDescription>
                Vlo saved <span className="font-medium text-text">{status.name}</span> to your downloads.
              </DialogDescription>
              <ul className="grid list-disc gap-1 pl-5 text-sm text-muted">
                <li>Keep a copy away from this device, such as on a cloud drive or a USB stick.</li>
                <li>To move the project to another device, open Vlo there and choose Import backup.</li>
              </ul>
              <div className="flex flex-wrap justify-end gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    downloadBytes(status.name, 'application/zip', status.bytes);
                  }}
                >
                  Download again
                </Button>
                <DialogClose asChild>
                  <Button type="button">Done</Button>
                </DialogClose>
              </div>
            </>
          ) : (
            <form
              className="grid gap-5"
              onSubmit={(event) => {
                event.preventDefault();
                void backUp(project.id);
              }}
            >
              <div className="grid gap-2">
                <DialogTitle className="[overflow-wrap:anywhere]">Back up {project.title}</DialogTitle>
                <DialogDescription>
                  One file with the whole project: every item, its text and its snapshots. Vlo can import it
                  on this device or on another one.
                </DialogDescription>
              </div>
              {files.length > 0 && (
                <div className="flex items-start gap-3">
                  <Switch
                    id={`${ids}-music`}
                    checked={music}
                    onCheckedChange={setMusic}
                    aria-describedby={`${ids}-music-hint`}
                  />
                  <div className="grid gap-0.5">
                    <label htmlFor={`${ids}-music`} className="text-sm font-medium">
                      Include my music
                    </label>
                    <p id={`${ids}-music-hint`} className="text-sm text-muted">
                      {files.length === 1 ? '1 file' : `${String(files.length)} files`},{' '}
                      {formatBytes(musicSize)}. Your music plays in every project, so it stays out of the
                      backup unless you add it.
                    </p>
                  </div>
                </div>
              )}
              {status.step === 'error' && (
                <p role="alert" className="text-sm text-accent-text">
                  Vlo could not make the backup. Reload Vlo and try again.
                </p>
              )}
              <p aria-live="polite" className="sr-only">
                {status.step === 'working' ? 'Making the backup.' : ''}
              </p>
              <div className="flex flex-wrap justify-end gap-2">
                <DialogClose asChild>
                  <Button type="button" variant="ghost">
                    Cancel
                  </Button>
                </DialogClose>
                <Button type="submit" disabled={status.step === 'working'}>
                  {status.step === 'working' ? 'Making the backup…' : 'Download backup'}
                </Button>
              </div>
            </form>
          )}
        </DialogContent>
      )}
    </Dialog>
  );
}
