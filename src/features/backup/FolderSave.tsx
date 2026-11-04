import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useState } from 'react';
import { db } from '@/lib/db';
import { Button } from '@/ui/button';
import {
  allowFolder,
  folderPermission,
  folderSaveSupported,
  forgetFolder,
  pickFolder,
  storedFolder,
  type FolderPermission,
  type FolderStatus,
  type SavedFolder,
} from './folderAccess';
import { FOLDER_STATUS_KEY } from './folderKeys';

/* Folder save in Settings (spec F29, plan Task B9). Only Chromium browsers can write to a folder. */

const times = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });

export function FolderSave() {
  const [supported] = useState(folderSaveSupported);
  const [permission, setPermission] = useState<FolderPermission | null>(null);
  const [error, setError] = useState<string | null>(null);
  const folder = useLiveQuery(
    async (): Promise<SavedFolder | null> => {
      try {
        return await storedFolder();
      } catch {
        return null;
      }
    },
    [],
    undefined,
  );
  const status = useLiveQuery(
    async () => ((await db.appMeta.get(FOLDER_STATUS_KEY))?.value as FolderStatus | undefined) ?? null,
    [],
    null,
  );

  useEffect(() => {
    if (!folder) return;
    let cancelled = false;
    void folderPermission(folder).then((answer) => {
      if (!cancelled) setPermission(answer);
    });
    return () => {
      cancelled = true;
    };
  }, [folder]);

  if (!supported || folder === undefined) return null;

  async function choose() {
    setError(null);
    try {
      const picked = await pickFolder();
      if (picked) setPermission(await folderPermission(picked));
    } catch {
      setError('Vlo cannot use that folder. Pick a folder in your documents or a cloud drive folder.');
    }
  }

  return (
    <div className="mt-6 grid gap-3">
      <h3 className="font-semibold">Save to a folder</h3>
      {folder === null ? (
        <>
          <p className="text-sm text-muted">
            Vlo can write each project&apos;s backup and a Markdown copy to a folder on this computer when you
            leave the project. A folder that a cloud drive syncs keeps a copy off this computer too.
          </p>
          <div>
            <Button type="button" variant="outline" onClick={() => void choose()}>
              Choose a folder
            </Button>
          </div>
        </>
      ) : (
        <>
          <p className="text-sm">
            Folder: <span className="font-medium">{folder.name}</span>
          </p>
          {permission === 'granted' && (
            <p className="text-sm text-muted">
              When you leave a project that changed, Vlo saves its backup and a Markdown copy to a folder
              named after the project, inside {folder.name}.
            </p>
          )}
          {permission === 'prompt' && (
            <p className="text-sm text-accent-text">
              The browser asks again after a restart. Allow Vlo to save to {folder.name}.
            </p>
          )}
          {permission === 'denied' && (
            <p className="text-sm text-accent-text">
              The browser blocked {folder.name}. Choose the folder again.
            </p>
          )}
          {status !== null && (
            <p className="text-sm text-muted" role="status">
              {status.ok
                ? `Last save: ${status.title}, ${times.format(status.at)}.`
                : `Vlo could not save ${status.title} to the folder on ${times.format(status.at)}. Check that the folder still exists, or choose it again.`}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            {permission === 'prompt' && (
              <Button
                type="button"
                onClick={() => {
                  void allowFolder(folder).then(setPermission);
                }}
              >
                Allow saving to {folder.name}
              </Button>
            )}
            <Button type="button" variant="outline" onClick={() => void choose()}>
              Choose another folder
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setPermission(null);
                void forgetFolder();
                void db.appMeta.delete(FOLDER_STATUS_KEY).catch(() => undefined);
              }}
            >
              Stop saving to a folder
            </Button>
          </div>
        </>
      )}
      {error !== null && (
        <p role="alert" className="text-sm text-accent-text">
          {error}
        </p>
      )}
    </div>
  );
}
