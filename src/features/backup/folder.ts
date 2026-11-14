import { buildExportDoc, exportFileName } from '@/features/export/build';
import { toMarkdown } from '@/features/export/markdown';
import { clock } from '@/lib/clock';
import { db } from '@/lib/db';
import { collectBackup } from './backup';
import { BACKUP_EXTENSION, backupFileName, backupNamePrefix, writeBackup } from './file';
import { folderPermission, storedFolder, type FolderStatus } from './folderAccess';
import { FOLDER_STATUS_KEY } from './folderKeys';

/*
 * Folder save (spec F29, plan Tasks B9 and G2), in Chromium browsers only. The writer picks a folder
 * once. When the writer leaves a project or the tab, and every 10 minutes in a project, Vlo writes the
 * project's backup and a Markdown copy of the whole project to a subfolder named after the project. The
 * backup has the date in its name, so the folder keeps one copy for each day. Vlo deletes only its own
 * dated copies after the newest 10, and never another file.
 */

/** The number of dated backups that folder save keeps for each project. */
export const KEEP_BACKUPS = 10;

/** The names in `names` that are dated backups of `title`, past the newest `KEEP_BACKUPS`. */
export function oldBackups(names: readonly string[], title: string): string[] {
  const prefix = backupNamePrefix(title);
  const dated = names.filter(
    (name) =>
      name.startsWith(prefix) &&
      name.endsWith(BACKUP_EXTENSION) &&
      /^\d{4}-\d{2}-\d{2}$/.test(name.slice(prefix.length, -BACKUP_EXTENSION.length)),
  );
  // The date is in year-month-day order, so the names sort by date.
  return dated.sort().reverse().slice(KEEP_BACKUPS);
}

/** The parts of the File System Access API that TypeScript's DOM types do not have yet. */
type ListedFolder = FileSystemDirectoryHandle & { keys(): AsyncIterable<string> };

/** Deletes the project's dated backups past the newest 10. A failed delete leaves the file. */
async function removeOldBackups(folder: FileSystemDirectoryHandle, title: string): Promise<void> {
  const names: string[] = [];
  for await (const name of (folder as ListedFolder).keys()) names.push(name);
  await Promise.all(oldBackups(names, title).map((name) => folder.removeEntry(name).catch(() => undefined)));
}

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

/** The names of the two files Vlo writes for a project on a day, inside the project's subfolder. */
export function folderFileNames(
  title: string,
  date: Date,
): { folder: string; backup: string; markdown: string } {
  const name = exportFileName(title);
  return { folder: name, backup: backupFileName(title, date), markdown: `${name}.md` };
}

/**
 * Writes a project's backup and Markdown copy to the folder. Returns false, and writes nothing, when
 * there is no folder or the browser has not allowed it.
 */
export async function saveToFolder(projectId: string): Promise<boolean> {
  const folder = await storedFolder();
  if (!folder || (await folderPermission(folder)) !== 'granted') return false;
  const backup = await collectBackup(projectId, { music: false });
  const names = folderFileNames(backup.project.title, new Date(backup.createdAt));
  // Two projects with one title would write over each other's files, so each gets its own folder.
  const name = names.folder;
  const twins = await db.projects
    .filter((p) => p.id !== projectId && exportFileName(p.title) === name)
    .count();
  if (twins > 0) names.folder = `${name} (${projectId.slice(0, 8)})`;
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
  await removeOldBackups(target, backup.project.title).catch(() => undefined);
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
