import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import type { Project } from '@/lib/db';

/*
 * Plan Task E3: a build with no Supabase settings shows "Sharing is not set up in this build." and sends
 * nothing. The project delete dialog warns about active links, because their owner tokens go with it.
 */

const PROJECT: Project = {
  id: 'p1',
  title: 'Salt Year',
  templates: ['novel'],
  aiMode: 'pen',
  createdAt: 0,
  updatedAt: 0,
  settings: { snapshotEveryMinutes: 10, aliasAiRequests: false, streaksEnabled: false, restDays: [] },
};

beforeEach(() => {
  vi.resetModules();
});
afterEach(async () => {
  cleanup();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  const { db } = await import('@/lib/db');
  await db.delete();
});

describe('Share panel', () => {
  test('a build with no Supabase settings says so, and offers no link', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', '');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', '');
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    const { SharePanel } = await import('@/features/share/SharePanel');
    render(
      <SharePanel
        open
        onOpenChange={() => undefined}
        project={PROJECT}
        items={[]}
        currentItemId={null}
      />,
    );
    expect(await screen.findByText('Sharing is not set up in this build.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Create link' })).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe('Delete dialog', () => {
  test('names the active links of the project, and not the stopped ones', async () => {
    const { db } = await import('@/lib/db');
    await db.open();
    const base = {
      projectId: 'p1',
      itemIds: [],
      title: 'T',
      createdAt: 0,
      ownerToken: 'o',
      key: 'k',
      comments: [],
      commentsReadAt: 0,
    };
    const later = Date.now() + 86_400_000;
    await db.shares.bulkAdd([
      { ...base, id: 'a', expiresAt: later, revoked: false },
      { ...base, id: 'b', expiresAt: later, revoked: false },
      { ...base, id: 'c', expiresAt: later, revoked: true },
      { ...base, id: 'd', expiresAt: 1, revoked: false },
    ]);
    const { DeleteDialog } = await import('@/features/library/DeleteDialog');
    render(<DeleteDialog project={PROJECT} onClose={() => undefined} />);
    expect(await screen.findByText(/This project has 2 active share links\./)).toBeTruthy();
    expect(screen.getByText(/choose Share, then Stop sharing/)).toBeTruthy();
  });
});
