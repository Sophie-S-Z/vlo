import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { readBackup } from '@/features/backup/backup';
import {
  KEEP_BACKUPS,
  oldBackups,
  saveToFolder,
  saveToFolderIfChanged,
  folderFileNames,
} from '@/features/backup/folder';
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

  async *keys(): AsyncGenerator<string> {
    for (const name of [...this.folders.keys(), ...this.files.keys()]) yield await Promise.resolve(name);
  }

  removeEntry(name: string): Promise<void> {
    if (!this.files.delete(name)) return Promise.reject(new DOMException('No file', 'NotFoundError'));
    return Promise.resolve();
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
    const names = folderFileNames(project.title, new Date(project.updatedAt + 1000));
    expect(names).toEqual({
      folder: 'Salt Year',
      backup: expect.stringMatching(/^Salt Year backup \d{4}-\d{2}-\d{2}\.vlo\.zip$/) as string,
      markdown: 'Salt Year.md',
    });
    const target = folder?.folders.get('Salt Year');
    const zip = target?.files.get(names.backup);
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

  test('keeps one dated backup for each day and deletes only its own copies past the newest 10', async () => {
    const project = await novel();
    const target = await folder?.getDirectoryHandle('Salt Year', { create: true });
    const day = (n: number) => `Salt Year backup 2026-10-${String(n).padStart(2, '0')}.vlo.zip`;
    for (let n = 1; n <= 12; n += 1) target?.files.set(day(n), new Uint8Array());
    target?.files.set('Salt Year.vlo.zip', new Uint8Array());
    target?.files.set('notes.txt', new Uint8Array());

    const now = Date.UTC(2026, 10, 9, 12);
    vi.spyOn(clock, 'now').mockReturnValue(now);
    expect(await saveToFolder(project.id)).toBe(true);
    expect(await saveToFolder(project.id)).toBe(true);
    const today = folderFileNames(project.title, new Date(now)).backup;
    const kept = [...(target?.files.keys() ?? [])].sort();
    // Today's copy and the 9 newest days stay. The writer's own files stay too.
    expect(kept).toEqual(
      [
        today,
        ...[4, 5, 6, 7, 8, 9, 10, 11, 12].map(day),
        'Salt Year.md',
        'Salt Year.vlo.zip',
        'notes.txt',
      ].sort(),
    );
  });
});

describe('oldBackups', () => {
  const name = (date: string) => `Salt Year backup ${date}.vlo.zip`;

  test('gives the dated backups of the title past the newest 10, oldest last', () => {
    const names = Array.from({ length: 12 }, (_, i) => name(`2026-01-${String(i + 1).padStart(2, '0')}`));
    expect(oldBackups(names, 'Salt: Year')).toEqual([name('2026-01-02'), name('2026-01-01')]);
    expect(oldBackups(names.slice(0, KEEP_BACKUPS), 'Salt: Year')).toEqual([]);
  });

  test('never gives another title, another extension, a name with no date or a writer file', () => {
    const names = [
      ...Array.from({ length: 11 }, (_, i) => name(`2026-02-${String(i + 1).padStart(2, '0')}`)),
      'Salt Year Two backup 2025-01-01.vlo.zip',
      'Salt Year backup 2025-01-01.zip',
      'Salt Year backup old.vlo.zip',
      'Salt Year backup 2025-01-01 (1).vlo.zip',
      'notes.vlo.zip',
    ];
    expect(oldBackups(names, 'Salt Year')).toEqual([name('2026-02-01')]);
  });
});
