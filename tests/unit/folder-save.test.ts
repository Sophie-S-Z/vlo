import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { readBackup } from '@/features/backup/backup';
import { saveToFolder, saveToFolderIfChanged, folderFileNames } from '@/features/backup/folder';
import type { FolderPermission, FolderStatus, SavedFolder } from '@/features/backup/folderAccess';
import { FOLDER_STATUS_KEY } from '@/features/backup/folderKeys';
import { createProject } from '@/features/library/projects';
import { clock } from '@/lib/clock';
import { db } from '@/lib/db';
import { writeItemUpdate } from '@/lib/ydocs';
import { proseUpdate } from './export-fixtures';

/* Folder save (spec F29, plan Task B9) against an in-memory folder with the File System Access shape. */

/** A folder in memory. Each file holds the bytes of its last write. */
class MemoryFolder {
  readonly folders = new Map<string, MemoryFolder>();
  readonly files = new Map<string, Uint8Array>();
  permission: FolderPermission = 'granted';
  failWrites = false;

  constructor(readonly name: string) {}

  getDirectoryHandle(name: string, options?: { create?: boolean }): Promise<MemoryFolder> {
    let folder = this.folders.get(name);
    if (!folder) {
      if (!options?.create) return Promise.reject(new DOMException('No folder', 'NotFoundError'));
      folder = new MemoryFolder(name);
      folder.failWrites = this.failWrites;
      this.folders.set(name, folder);
    }
    return Promise.resolve(folder);
  }

  getFileHandle(name: string) {
    const files = this.files;
    const fail = this.failWrites;
    return Promise.resolve({
      createWritable: () => {
        const chunks: Uint8Array[] = [];
        return Promise.resolve({
          write: async (data: string | Blob) => {
            if (fail) throw new DOMException('The disk is full.', 'QuotaExceededError');
            chunks.push(
              typeof data === 'string'
                ? new TextEncoder().encode(data)
                : new Uint8Array(await data.arrayBuffer()),
            );
          },
          close: () => {
            const size = chunks.reduce((sum, c) => sum + c.length, 0);
            const out = new Uint8Array(size);
            let at = 0;
            for (const c of chunks) {
              out.set(c, at);
              at += c.length;
            }
            files.set(name, out);
            return Promise.resolve();
          },
          abort: () => Promise.resolve(),
        });
      },
    });
  }

  queryPermission(): Promise<FolderPermission> {
    return Promise.resolve(this.permission);
  }
}

let folder: MemoryFolder | null = null;

vi.mock('@/features/backup/folderAccess', async (original) => {
  const real = await original<typeof import('@/features/backup/folderAccess')>();
  return {
    ...real,
    storedFolder: () =>
      Promise.resolve(folder ? ({ handle: folder, name: folder.name } as unknown as SavedFolder) : null),
  };
});

beforeEach(async () => {
  await db.open();
  folder = new MemoryFolder('Writing');
  Object.defineProperty(navigator, 'storage', {
    configurable: true,
    value: { persist: () => Promise.resolve(true) },
  });
});
afterEach(async () => {
  Reflect.deleteProperty(navigator, 'storage');
  await db.delete();
  for (const d of await indexedDB.databases())
    if (d.name?.startsWith('vlo-item-')) indexedDB.deleteDatabase(d.name);
});

async function novel() {
  const { project } = await createProject({ title: 'Salt: Year', templates: ['novel'] });
  const scene = (await db.items.where('projectId').equals(project.id).toArray()).find(
    (i) => i.kind === 'scene',
  );
  if (!scene) throw new Error('No scene.');
  await writeItemUpdate(scene.id, proseUpdate(['The harbour  lights came on one by one.']), 1);
  return project;
}

async function lastStatus(): Promise<FolderStatus | undefined> {
  return (await db.appMeta.get(FOLDER_STATUS_KEY))?.value as FolderStatus | undefined;
}

describe('Folder save', () => {
  test('writes the backup and a Markdown copy to a subfolder named after the project', async () => {
    const project = await novel();
    vi.spyOn(clock, 'now').mockReturnValue(project.updatedAt + 1000);
    expect(await saveToFolder(project.id)).toBe(true);
    const names = folderFileNames(project.title);
    expect(names).toEqual({ folder: 'Salt Year', backup: 'Salt Year.vlo.zip', markdown: 'Salt Year.md' });
    const target = folder?.folders.get('Salt Year');
    const zip = target?.files.get('Salt Year.vlo.zip');
    expect(zip).toBeDefined();
    const backup = await readBackup(zip ?? new Uint8Array());
    expect(backup.project.id).toBe(project.id);
    expect(new TextDecoder().decode(target?.files.get('Salt Year.md'))).toContain(
      'The harbour  lights came on one by one.',
    );
    // A save to the folder counts as a backup for the reminder.
    expect((await db.projects.get(project.id))?.lastBackupAt).toBe(project.updatedAt + 1000);
  });

  test('writes nothing without a folder, or before the browser allows the folder', async () => {
    const project = await novel();
    if (folder) folder.permission = 'prompt';
    expect(await saveToFolder(project.id)).toBe(false);
    expect(folder?.folders.size).toBe(0);
    folder = null;
    expect(await saveToFolder(project.id)).toBe(false);
  });

  test('saves after a change, skips a project with no change since its backup, and records each result', async () => {
    const project = await novel();
    await saveToFolderIfChanged(project.id);
    expect((await lastStatus())?.ok).toBe(true);
    expect((await lastStatus())?.title).toBe('Salt: Year');

    const target = folder?.folders.get('Salt Year');
    target?.files.clear();
    await saveToFolderIfChanged(project.id);
    expect(target?.files.size).toBe(0);
  });

  test('a failed write is recorded for Settings and never throws', async () => {
    const project = await novel();
    if (folder) folder.failWrites = true;
    await expect(saveToFolderIfChanged(project.id)).resolves.toBeUndefined();
    expect((await lastStatus())?.ok).toBe(false);
    // The reminder still counts the project as not backed up.
    expect((await db.projects.get(project.id))?.lastBackupAt).toBeUndefined();
  });
});
