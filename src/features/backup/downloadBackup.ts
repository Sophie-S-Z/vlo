import { downloadBytes } from '@/lib/download';
import { recordFeature } from '@/features/usage/usage';
import type { BackupFile } from './backup';

/** Makes a project's backup and saves it to the downloads. The backup code loads on the first use. */
export async function downloadBackup(projectId: string, options: { music: boolean }): Promise<BackupFile> {
  const { backUpProject } = await import('./backup');
  const file = await backUpProject(projectId, options);
  downloadBytes(file.name, 'application/zip', file.bytes);
  recordFeature('backup');
  return file;
}
