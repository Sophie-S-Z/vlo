import type { Project } from '@/lib/db';

/*
 * The backup date on each project card and the reminder (spec section 9). Safari can clear site data
 * after 7 days without a visit, so a project is due after 7 days without a backup. With no folder save,
 * the Library also asks for a backup after each change (roadmap F32).
 */

export const REMIND_AFTER_DAYS = 7;
const DAY = 86_400_000;

/** Whole calendar days from `from` to `to`, in the device's time zone. */
export function daysBetween(from: number, to: number): number {
  const start = new Date(from);
  const end = new Date(to);
  const a = Date.UTC(start.getFullYear(), start.getMonth(), start.getDate());
  const b = Date.UTC(end.getFullYear(), end.getMonth(), end.getDate());
  return Math.max(0, Math.round((b - a) / DAY));
}

/**
 * True when the project needs a backup: 7 days or more have passed since the last backup, or since the
 * project was made, and the writing changed after the last backup.
 */
export function backupDue(
  project: Pick<Project, 'createdAt' | 'updatedAt' | 'lastBackupAt'>,
  now: number,
): boolean {
  const last = project.lastBackupAt;
  if (last !== undefined && project.updatedAt <= last) return false;
  return now - (last ?? project.createdAt) >= REMIND_AFTER_DAYS * DAY;
}

/** True when the writing changed after the last backup, or after the project was made. */
export function changedSinceBackup(
  project: Pick<Project, 'createdAt' | 'updatedAt' | 'lastBackupAt'>,
): boolean {
  return project.updatedAt > (project.lastBackupAt ?? project.createdAt);
}

/** The backup date for a project card, such as "Backed up 3 days ago". */
export function backupLabel(project: Pick<Project, 'lastBackupAt'>, now: number): string {
  if (project.lastBackupAt === undefined) return 'No backup yet';
  const days = daysBetween(project.lastBackupAt, now);
  if (days === 0) return 'Backed up today';
  if (days === 1) return 'Backed up yesterday';
  return `Backed up ${String(days)} days ago`;
}
