import { buildExportDoc, exportFileName } from '@/features/export/build';
import { toMarkdown } from '@/features/export/markdown';
import { clock } from '@/lib/clock';
import { db } from '@/lib/db';
import { collectBackup } from './backup';
import { BACKUP_EXTENSION, writeBackup } from './file';
import { folderPermission, storedFolder, type FolderStatus } from './folderAccess';
import { FOLDER_STATUS_KEY } from './folderKeys';

/*
 * Folder save (spec F29, plan Task B9), in Chromium browsers only. The writer picks a folder once. When
 * the writer leaves a project, or leaves the tab, Vlo writes the project's backup and a Markdown copy
 * of the whole project to a subfolder named after the project. Each save replaces the two files, so
 * Vlo never deletes a file in the writer's folder.
 */

async function writeFile(folder: FileSystemDirectoryHandle, name: string, data: Uint8Array | string) {
  const file = await folder.getFileHandle(name, { create: true });
  const writable = await file.createWritable();
  try {
    await writable.write(typeof data === 'string' ? data : new Blob([data as BlobPart]));
    await writable.close();
  } catch (error) {
    await writable.abort().catch(() => undefined);
    throw error;
  }
}

/** The names of the two files Vlo writes for a project, inside the project's subfolder. */
export function folderFileNames(title: string): { folder: string; backup: string; markdown: string } {
  const name = exportFileName(title);
  return { folder: name, backup: `${name}${BACKUP_EXTENSION}`, markdown: `${name}.md` };
}

/**
 * Writes a project's backup and Markdown copy to the folder. Returns false, and writes nothing, when
 * there is no folder or the browser has not allowed it.
 */
export async function saveToFolder(projectId: string): Promise<boolean> {
  const folder = await storedFolder();
  if (!folder || (await folderPermission(folder)) !== 'granted') return false;
  const backup = await collectBackup(projectId, { music: false });
  const names = folderFileNames(backup.project.title);
  const markdown = toMarkdown(
    buildExportDoc({
      project: backup.project,
      items: backup.items,
      scope: { kind: 'project' },
      updates: backup.updates,
    }),
  );
  const zip = await writeBackup(backup);
  const target = await folder.handle.getDirectoryHandle(names.folder, { create: true });
  await writeFile(target, names.backup, zip);
  await writeFile(target, names.markdown, markdown);
  // The file in the folder is a backup, so the reminder counts it. The project keeps its place.
  await db.projects.update(projectId, { lastBackupAt: backup.createdAt });
  return true;
}

/**
 * Saves the project to the folder when its writing changed after its last backup, and records the
 * result for Settings. Never throws: the folder may be gone or full, and the writing stays safe in the
 * browser.
 */
export async function saveToFolderIfChanged(projectId: string): Promise<void> {
  const project = await db.projects.get(projectId).catch(() => undefined);
  if (!project) return;
  if (project.lastBackupAt !== undefined && project.updatedAt <= project.lastBackupAt) return;
  let ok: boolean;
  try {
    if (!(await saveToFolder(projectId))) return;
    ok = true;
  } catch {
    ok = false;
  }
  const status: FolderStatus = { at: clock.now(), ok, title: project.title };
  await db.appMeta.put({ key: FOLDER_STATUS_KEY, value: status }).catch(() => undefined);
}
