import { Upload } from 'lucide-react';
import { useImperativeHandle, useRef, useState, type Ref } from 'react';
import { useNavigate } from 'react-router';
import type { Project } from '@/lib/db';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
} from '@/ui/alert-dialog';
import { Button } from '@/ui/button';
import type { Backup } from './file';
import type { ImportMode } from './backup';
import { recordError, recordFeature } from '@/features/usage/usage';

/*
 * Import a backup (spec section 9, plan Task B8). A backup of a project that is not on this device goes in
 * as it is. A backup of a project that is here asks first: replace it, or keep both.
 */

/** Larger files would not fit in the memory of most phones. */
const MAX_BYTES = 1024 * 1024 * 1024;

type Status =
  | { step: 'idle' }
  | { step: 'working' }
  | { step: 'conflict'; backup: Backup; existing: Project }
  | { step: 'error'; message: string };

const dates = new Intl.DateTimeFormat(undefined, { dateStyle: 'long' });

/** What a menu item calls to open the file picker of Import backup. */
export interface ImportHandle {
  open: () => void;
}

/**
 * Import backup. With `trigger` false it draws no button, and the Library's Import menu opens the file
 * picker through `ref` (Phase 17 decision S4).
 */
export function ImportBackup({ ref, trigger = true }: { ref?: Ref<ImportHandle>; trigger?: boolean }) {
  const navigate = useNavigate();
  const input = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<Status>({ step: 'idle' });
  useImperativeHandle(ref, () => ({
    open: () => {
      input.current?.click();
    },
  }));

  async function store(backup: Backup, mode: ImportMode) {
    setStatus({ step: 'working' });
    try {
      const { importBackup } = await import('./backup');
      const id = await importBackup(backup, mode);
      recordFeature('backup-import');
      setStatus({ step: 'idle' });
      void navigate(`/p/${id}`);
    } catch {
      recordError('backup-import-failed');
      setStatus({
        step: 'error',
        message:
          mode === 'replace'
            ? 'Vlo could not import the backup. Close other Vlo tabs, reload Vlo and import the file again.'
            : 'Vlo could not import the backup. Reload Vlo and try again.',
      });
    }
  }

  async function read(file: File) {
    if (file.size > MAX_BYTES) {
      setStatus({ step: 'error', message: 'This file is larger than 1 GB, so it is not a Vlo backup.' });
      return;
    }
    setStatus({ step: 'working' });
    try {
      const { readBackup, projectWithId } = await import('./backup');
      const { BackupError } = await import('./file');
      let backup: Backup;
      try {
        backup = await readBackup(new Uint8Array(await file.arrayBuffer()));
      } catch (error) {
        setStatus({
          step: 'error',
          message:
            error instanceof BackupError
              ? error.message
              : 'Vlo could not read this file. Pick the file again.',
        });
        return;
      }
      const existing = await projectWithId(backup.project.id);
      if (existing) setStatus({ step: 'conflict', backup, existing });
      else await store(backup, 'same');
    } catch {
      setStatus({ step: 'error', message: 'Vlo could not import the backup. Reload Vlo and try again.' });
    }
  }

  const working = status.step === 'working';
  return (
    <>
      <input
        ref={input}
        type="file"
        accept=".zip,application/zip"
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(event) => {
          const file = event.target.files?.[0];
          // The same file can be picked again after an error.
          event.target.value = '';
          if (file) void read(file);
        }}
      />
      {trigger && (
        <Button
          type="button"
          variant="ghost"
          disabled={working}
          aria-busy={working}
          onClick={() => {
            input.current?.click();
          }}
        >
          <Upload aria-hidden="true" className="size-4" />
          {working ? 'Importing…' : 'Import backup'}
        </Button>
      )}
      <p aria-live="polite" className="sr-only">
        {working ? 'Importing the backup.' : ''}
      </p>

      <AlertDialog
        open={status.step === 'conflict' || status.step === 'error'}
        onOpenChange={(open) => {
          if (!open) setStatus({ step: 'idle' });
        }}
      >
        {status.step === 'conflict' && (
          <AlertDialogContent>
            <AlertDialogTitle className="[overflow-wrap:anywhere]">
              {status.existing.title} is already on this device
            </AlertDialogTitle>
            <AlertDialogDescription>
              This backup of {status.backup.project.title} is from{' '}
              {dates.format(status.backup.createdAt || status.backup.project.updatedAt)}. Replace removes the
              project on this device and puts the backup in its place. Keep both adds the backup as a new
              project.
            </AlertDialogDescription>
            <p className="text-sm text-muted">Close other Vlo tabs before you replace the project.</p>
            <div className="flex flex-wrap justify-end gap-2">
              <AlertDialogCancel asChild>
                <Button variant="ghost">Cancel</Button>
              </AlertDialogCancel>
              <Button
                variant="ghost"
                onClick={() => {
                  void store(status.backup, 'copy');
                }}
              >
                Keep both
              </Button>
              <Button
                onClick={() => {
                  void store(status.backup, 'replace');
                }}
              >
                Replace
              </Button>
            </div>
          </AlertDialogContent>
        )}
        {status.step === 'error' && (
          <AlertDialogContent>
            <AlertDialogTitle>Vlo cannot import this file</AlertDialogTitle>
            <AlertDialogDescription>{status.message}</AlertDialogDescription>
            <div className="flex justify-end">
              <AlertDialogCancel asChild>
                <Button>OK</Button>
              </AlertDialogCancel>
            </div>
          </AlertDialogContent>
        )}
      </AlertDialog>
    </>
  );
}
