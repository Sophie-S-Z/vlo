import { useEffect, useState } from 'react';
import { Button } from '@/ui/button';
import {
  allowFolder,
  folderPermission,
  folderSaveSupported,
  storedFolder,
  type SavedFolder,
} from './folderAccess';

/*
 * After a browser restart, Chrome asks again before Vlo can write to the writer's folder (spec F29). The
 * Library shows the question, because the browser accepts the answer only from a click.
 */
export function FolderAllow() {
  const [folder, setFolder] = useState<SavedFolder | null>(null);

  useEffect(() => {
    if (!folderSaveSupported()) return;
    const run = { cancelled: false };
    void (async () => {
      try {
        const saved = await storedFolder();
        if (saved && (await folderPermission(saved)) === 'prompt' && !run.cancelled) setFolder(saved);
      } catch {
        // No folder: nothing to ask.
      }
    })();
    return () => {
      run.cancelled = true;
    };
  }, []);

  if (folder === null) return null;
  return (
    <div className="mt-8 flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-card)] border border-rule bg-surface p-4">
      <p className="text-sm">Vlo needs your OK to save projects to {folder.name} again.</p>
      <Button
        type="button"
        variant="outline"
        onClick={() => {
          void allowFolder(folder).then((answer) => {
            if (answer !== 'prompt') setFolder(null);
          });
        }}
      >
        Allow saving to {folder.name}
      </Button>
    </div>
  );
}
