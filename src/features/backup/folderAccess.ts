import { db } from '@/lib/db';
import { FOLDER_KEY } from './folderKeys';

/*
 * The folder for folder save (spec F29): the writer's pick, the browser's permission, and the result of
 * the last save. This file loads with Settings, so it holds no backup code.
 */

export type FolderPermission = 'granted' | 'prompt' | 'denied';

/** The parts of the File System Access API that TypeScript's DOM types do not have yet. */
interface PermissionHandle {
  queryPermission?: (options: { mode: 'readwrite' }) => Promise<FolderPermission>;
  requestPermission?: (options: { mode: 'readwrite' }) => Promise<FolderPermission>;
}
type FolderHandle = FileSystemDirectoryHandle & PermissionHandle;
type PickerWindow = Window & {
  showDirectoryPicker?: (options?: {
    id?: string;
    mode?: 'readwrite';
    startIn?: string;
  }) => Promise<FolderHandle>;
};

export interface FolderStatus {
  at: number;
  ok: boolean;
  /** The project title, so Settings can say which save failed. */
  title: string;
}

export interface SavedFolder {
  handle: FolderHandle;
  name: string;
}

export function folderSaveSupported(): boolean {
  return typeof window !== 'undefined' && typeof (window as PickerWindow).showDirectoryPicker === 'function';
}

export async function storedFolder(): Promise<SavedFolder | null> {
  const row = await db.appMeta.get(FOLDER_KEY);
  const value = row?.value as Partial<SavedFolder> | undefined;
  if (!value?.handle || typeof value.name !== 'string') return null;
  return { handle: value.handle, name: value.name };
}

/** The browser's current answer for the folder. A handle with no permission methods counts as allowed. */
export async function folderPermission(folder: SavedFolder): Promise<FolderPermission> {
  if (typeof folder.handle.queryPermission !== 'function') return 'granted';
  try {
    return await folder.handle.queryPermission({ mode: 'readwrite' });
  } catch {
    return 'denied';
  }
}

/** Asks the browser for the folder again. Call it from a click, because the browser needs one. */
export async function allowFolder(folder: SavedFolder): Promise<FolderPermission> {
  if (typeof folder.handle.requestPermission !== 'function') return folderPermission(folder);
  try {
    return await folder.handle.requestPermission({ mode: 'readwrite' });
  } catch {
    return 'denied';
  }
}

/**
 * Lets the writer pick the folder, and keeps it. Returns null when the writer closes the picker.
 * Call it from a click, because the browser needs one.
 */
export async function pickFolder(): Promise<SavedFolder | null> {
  const picker = (window as PickerWindow).showDirectoryPicker;
  if (!picker) return null;
  let handle: FolderHandle;
  try {
    handle = await picker({ id: 'vlo-backups', mode: 'readwrite', startIn: 'documents' });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') return null;
    throw error;
  }
  const folder = { handle, name: handle.name };
  await db.appMeta.put({ key: FOLDER_KEY, value: folder });
  return folder;
}

export async function forgetFolder(): Promise<void> {
  await db.appMeta.delete(FOLDER_KEY);
}
