import { describe, expect, test } from 'vitest';
import { safetyState } from '@/features/backup/safety';
import type { Project } from '@/lib/db';

/* The safety badge (roadmap F31, plan Task G1). */

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 10, 9, 12);

function project(title: string, lastBackupAt?: number): Project {
  return {
    id: title,
    title,
    templates: ['novel'],
    aiMode: 'pen',
    createdAt: NOW - 30 * DAY,
    updatedAt: NOW - DAY,
    ...(lastBackupAt === undefined ? {} : { lastBackupAt }),
    settings: { snapshotEveryMinutes: 10, aliasAiRequests: true, streaksEnabled: false, restDays: [] },
  };
}

const fresh = project('Fresh', NOW - DAY / 2);
const stale = project('Stale', NOW - 10 * DAY);

describe('safetyState', () => {
  test('projects with recent backups are safe', () => {
    expect(safetyState({ projects: [fresh], safari: false, folder: null, now: NOW })).toEqual({
      level: 'safe',
      reasons: [],
    });
  });

  test('a backup that is due needs a check and names the project', () => {
    expect(safetyState({ projects: [fresh, stale], safari: false, folder: null, now: NOW })).toEqual({
      level: 'check',
      reasons: [{ kind: 'backup', project: stale }],
    });
  });

  test('a failed folder save needs a check and names the project', () => {
    const folder = { at: NOW, ok: false, title: 'Fresh' };
    expect(safetyState({ projects: [fresh], safari: false, folder, now: NOW })).toEqual({
      level: 'check',
      reasons: [{ kind: 'folder', title: 'Fresh' }],
    });
  });

  test('a good folder save adds no reason', () => {
    const folder = { at: NOW, ok: true, title: 'Fresh' };
    expect(safetyState({ projects: [fresh], safari: false, folder, now: NOW }).level).toBe('safe');
  });

  test('Safari outside an installed app is a risk, with the other reasons after it', () => {
    expect(safetyState({ projects: [stale], safari: true, folder: null, now: NOW })).toEqual({
      level: 'risk',
      reasons: [{ kind: 'safari' }, { kind: 'backup', project: stale }],
    });
  });
});
