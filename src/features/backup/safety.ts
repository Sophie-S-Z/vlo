import type { SyncSpace } from '@/features/sync/space';
import type { Project } from '@/lib/db';
import type { FolderStatus } from './folderAccess';
import { backupDue } from './reminder';

/*
 * The safety badge (roadmap F31): one word for how safe the writing on this device is, and the reasons.
 * Data loss is the first reason that writers leave a tool, so the badge shows on every screen.
 */

export type SafetyLevel = 'safe' | 'check' | 'risk';

export type SafetyReason =
  | { kind: 'safari' }
  | { kind: 'folder'; title: string }
  | { kind: 'backup'; project: Project }
  | { kind: 'sync' };

export interface SafetyInput {
  projects: readonly Project[];
  /** True in Safari outside an installed web app. */
  safari: boolean;
  /** The result of the last folder save, or null when the writer has no folder. */
  folder: FolderStatus | null;
  /** This device's sync record, or null when it does not sync (F49). */
  sync: SyncSpace | null;
  now: number;
}

/**
 * Safari outside an installed app can clear the data after 7 days without a visit, so it is a risk. A
 * backup that is due, a failed folder save or a sync that needs a newer Vlo needs a check.
 */
export function safetyState({ projects, safari, folder, sync, now }: SafetyInput): {
  level: SafetyLevel;
  reasons: SafetyReason[];
} {
  const reasons: SafetyReason[] = [];
  if (safari) reasons.push({ kind: 'safari' });
  if (folder && !folder.ok) reasons.push({ kind: 'folder', title: folder.title });
  if (sync?.blocked) reasons.push({ kind: 'sync' });
  for (const project of projects) if (backupDue(project, now)) reasons.push({ kind: 'backup', project });
  const level = safari ? 'risk' : reasons.length > 0 ? 'check' : 'safe';
  return { level, reasons };
}
