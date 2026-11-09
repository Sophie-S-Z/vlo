import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { fromBase64Url } from '@/lib/crypto';
import type { Item, Project } from '@/lib/db';
import type { PrivatePerson } from '@/lib/privacy';
import { proseUpdate } from './export-fixtures';

/*
 * Plan Task E3 (spec section 11): a share link sends the sealed bundle and keeps its key on this device.
 * The network module reads the Supabase settings when it loads, so each test loads the modules again,
 * and the test uses the same database module as the share code.
 */

type Modules = typeof import('@/features/share/share') &
  typeof import('@/features/library/projects') &
  typeof import('@/lib/ydocs') &
  typeof import('@/features/binder/items') & { db: typeof import('@/lib/db').db };
let m: Modules;

const URL_ = 'https://vlo-test.supabase.co';
const SHARE_ID = '3f2a7b1c-9d4e-4f60-8a1b-2c3d4e5f6a7b';

const PEOPLE: PrivatePerson[] = [{ id: 'rosa', variants: [{ real: 'Rosa', alias: 'Maria' }] }];

interface Call {
  name: string;
  body: Record<string, unknown>;
  headers: Headers;
  url: string;
}

let calls: Call[] = [];
let answers: Record<string, () => Response> = {};

beforeEach(async () => {
  vi.resetModules();
  vi.stubEnv('VITE_SUPABASE_URL', URL_);
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon-key');
  calls = [];
  answers = {
    create_share: () => Response.json(SHARE_ID),
    revoke_share: () => Response.json(true),
  };
  vi.stubGlobal(
    'fetch',
    vi.fn((url: URL | string, init: RequestInit) => {
      const name = url.toString().split('/').at(-1) ?? '';
      calls.push({
        name,
        url: url.toString(),
        headers: new Headers(init.headers),
        body: JSON.parse(init.body as string) as Record<string, unknown>,
      });
      const answer = answers[name];
      return Promise.resolve(answer ? answer() : new Response('{}', { status: 404 }));
    }),
  );
  m = {
    ...(await import('@/features/share/share')),
    ...(await import('@/features/library/projects')),
    ...(await import('@/lib/ydocs')),
    ...(await import('@/features/binder/items')),
    db: (await import('@/lib/db')).db,
  };
  await m.db.open();
});

afterEach(async () => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  await m.db.delete();
  for (const d of await indexedDB.databases())
    if (d.name?.startsWith('vlo-item-')) indexedDB.deleteDatabase(d.name);
});

async function memoir(): Promise<{ project: Project; items: Item[] }> {
  const { project } = await m.createProject({ title: 'Summers with Rosa', templates: ['memoir'] });
  const first = (await m.db.items.where('projectId').equals(project.id).toArray()).find(
    (i) => i.kind === 'memory',
  );
  if (!first) throw new Error('The memoir has no memory.');
  await m.writeItemUpdate(first.id, proseUpdate(['Rosa drove us to the coast.']), 1);
  const second = await m.addItem(project.id, null, 'memory', 'Rosa stays');
  await m.writeItemUpdate(second.id, proseUpdate(['Rosa stayed behind.']), 1);
  return { project, items: await m.db.items.where('projectId').equals(project.id).toArray() };
}

describe('share links', () => {
  test('a memoir link sends the four arguments only, with the aliases and no key', async () => {
    const { prepareShare, createShare, shareLink } = m;
    const { project, items } = await memoir();
    const ids = items.filter((i) => i.kind === 'memory').map((i) => i.id);
    const prepared = await prepareShare({
      project,
      items,
      itemIds: ids,
      people: PEOPLE,
      questions: ['Is the ending clear?'],
    });
    expect(JSON.stringify(prepared.bundle)).not.toContain('Rosa');
    expect(prepared.bundle.title).toBe('Summers with Maria');
    expect(prepared.names.unmarked.map((n) => n.name)).toEqual(['Rosa']);

    const record = await createShare(prepared, project.id, 14);
    expect(calls.map((c) => c.name)).toEqual(['create_share']);
    const [call] = calls;
    expect(Object.keys(call?.body ?? {}).sort()).toEqual(['p_days', 'p_iv', 'p_owner_token', 'p_payload']);
    expect(call?.body.p_days).toBe(14);
    expect(call?.body.p_owner_token).toBe(record.ownerToken);

    // The key is in no form in the URL, the headers or the body.
    const raw = fromBase64Url(record.key);
    const forms = [
      record.key,
      btoa(String.fromCharCode(...raw)),
      [...raw].map((b) => b.toString(16).padStart(2, '0')).join(''),
    ];
    const sent = [call?.url, JSON.stringify(call?.body), JSON.stringify([...(call?.headers ?? [])])].join(
      '\n',
    );
    for (const form of forms) expect(sent).not.toContain(form);
    expect(JSON.stringify(call?.body)).not.toContain('Maria');

    expect(record).toMatchObject({
      id: SHARE_ID,
      projectId: project.id,
      revoked: false,
      questions: ['Is the ending clear?'],
      comments: [],
    });
    expect(record.expiresAt - record.createdAt).toBe(14 * 86_400_000);
    expect(await m.db.shares.get(SHARE_ID)).toEqual(record);
    expect(shareLink(record, 'https://vlo.app')).toBe(`https://vlo.app/r/${SHARE_ID}#k=${record.key}`);
    expect(raw).toHaveLength(32);
  });

  test('a link holds the picked items in binder order, under the project title', async () => {
    const { prepareShare } = m;
    const { project } = await m.createProject({ title: 'Salt Year', templates: ['novel'] });
    const chapter = (await m.db.items.where('projectId').equals(project.id).toArray()).find(
      (i) => i.kind === 'chapter',
    );
    await m.addItem(project.id, chapter?.id ?? null, 'scene', 'The harbour');
    await m.addItem(project.id, chapter?.id ?? null, 'scene', 'The gulls');
    const items = await m.db.items.where('projectId').equals(project.id).toArray();
    const scenes = items.filter((i) => i.kind === 'scene');
    expect(scenes).toHaveLength(3);
    const prepared = await prepareShare({
      project,
      items,
      itemIds: [...scenes.map((s) => s.id)].reverse(),
      people: [],
      questions: [' Where did you stop reading? ', ''],
    });
    expect(prepared.bundle.title).toBe('Salt Year');
    // The questions go in the bundle, trimmed, and an empty one stays out.
    expect(prepared.bundle.questions).toEqual(['Where did you stop reading?']);
    expect(prepared.itemIds).toEqual(
      scenes
        .map((s) => s.id)
        .sort((a, b) => {
          const order = (id: string) => items.find((i) => i.id === id)?.order ?? '';
          return order(a) < order(b) ? -1 : 1;
        }),
    );
    await expect(prepareShare({ project, items, itemIds: [], people: [] })).rejects.toThrow(
      'Pick at least one item to share.',
    );
  });

  test('a payload over the server limit sends nothing', async () => {
    const { createShare, MAX_PAYLOAD } = m;
    const { ShareError } = await import('@/features/share/rpc');
    // Random bytes do not compress, so the sealed payload passes the limit.
    const noise: string[] = [];
    for (let i = 0; i < MAX_PAYLOAD / 1024; i++)
      noise.push(btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(768)))));
    const bundle = {
      v: 1 as const,
      title: 'T',
      createdAt: 1,
      sections: [{ title: 'S', form: null, blocks: [{ type: 'p' as const, runs: [{ t: noise.join('') }] }] }],
    };
    const failure = createShare({ bundle, itemIds: ['i'], names: { unmarked: [], changed: [] } }, 'p', 7);
    await expect(failure).rejects.toBeInstanceOf(ShareError);
    await expect(failure).rejects.toMatchObject({ kind: 'too-large' });
    await expect(failure).rejects.toThrow(
      /^These items come to \d+\.\d MB once sealed\. A link holds at most 2\.8 MB/,
    );
    expect(calls).toHaveLength(0);
  });

  test('an answer that is not a share id stores nothing', async () => {
    const { createShare } = m;
    answers.create_share = () => Response.json('<img src=x>');
    const bundle = { v: 1 as const, title: 'T', createdAt: 1, sections: [] };
    await expect(
      createShare({ bundle, itemIds: ['i'], names: { unmarked: [], changed: [] } }, 'p', 1),
    ).rejects.toMatchObject({ kind: 'server' });
    expect(await m.db.shares.count()).toBe(0);
  });

  test('Stop sharing sends the owner token to revoke_share only, and an active link cannot leave the list', async () => {
    const { createShare, revokeShare, removeShare, shareState } = m;
    const bundle = { v: 1 as const, title: 'T', createdAt: 1, sections: [] };
    const record = await createShare(
      { bundle, itemIds: ['i'], names: { unmarked: [], changed: [] } },
      'p',
      7,
    );
    await expect(removeShare(record.id)).rejects.toThrow('Stop sharing this link first.');
    await revokeShare(record.id);
    const revoke = calls.at(-1);
    expect(revoke?.name).toBe('revoke_share');
    expect(revoke?.body).toEqual({ p_id: SHARE_ID, p_owner_token: record.ownerToken });
    const stopped = await m.db.shares.get(record.id);
    expect(stopped && shareState(stopped)).toBe('revoked');
    await removeShare(record.id);
    expect(await m.db.shares.count()).toBe(0);
  });

  test('a link shows as expired after its days, and a failed revoke keeps it active', async () => {
    const { createShare, revokeShare, shareState } = m;
    const bundle = { v: 1 as const, title: 'T', createdAt: 1, sections: [] };
    const record = await createShare(
      { bundle, itemIds: ['i'], names: { unmarked: [], changed: [] } },
      'p',
      1,
    );
    expect(shareState(record)).toBe('active');
    expect(shareState(record, record.createdAt + 86_400_000)).toBe('expired');
    answers.revoke_share = () => new Response(JSON.stringify({ message: 'boom' }), { status: 500 });
    await expect(revokeShare(record.id)).rejects.toMatchObject({ kind: 'server' });
    expect((await m.db.shares.get(record.id))?.revoked).toBe(false);
  });

  test('Stop sharing reads the comments first, and a false answer keeps a link that the server still shows', async () => {
    const { createShare, revokeShare } = m;
    const bundle = { v: 1 as const, title: 'T', createdAt: 1, sections: [] };
    const record = await createShare(
      { bundle, itemIds: ['i'], names: { unmarked: [], changed: [] } },
      'p',
      7,
    );
    answers.list_comments = () => Response.json([]);
    answers.revoke_share = () => Response.json(false);
    answers.get_share = () =>
      Response.json([{ payload: 'x', iv: 'y', expires_at: new Date().toISOString(), status: 'ok' }]);
    calls = [];
    await expect(revokeShare(record.id)).rejects.toMatchObject({ kind: 'server' });
    expect(calls.map((c) => c.name)).toEqual(['list_comments', 'revoke_share', 'get_share']);
    const kept = await m.db.shares.get(record.id);
    expect(kept?.revoked).toBe(false);
    expect(kept?.commentsReadAt).toBeGreaterThan(0);

    answers.get_share = () =>
      Response.json([{ payload: null, iv: null, expires_at: new Date().toISOString(), status: 'revoked' }]);
    await revokeShare(record.id);
    expect((await m.db.shares.get(record.id))?.revoked).toBe(true);
  });

  test('a link stops at once when this device cannot keep its record', async () => {
    const { createShare } = m;
    vi.spyOn(m.db.shares, 'add').mockRejectedValueOnce(new Error('QuotaExceededError'));
    const bundle = { v: 1 as const, title: 'T', createdAt: 1, sections: [] };
    await expect(
      createShare({ bundle, itemIds: ['i'], names: { unmarked: [], changed: [] } }, 'p', 7),
    ).rejects.toThrow('QuotaExceededError');
    expect(calls.map((c) => c.name)).toEqual(['create_share', 'revoke_share']);
  });

  test('deleting a project removes its links from this device', async () => {
    const { createShare } = m;
    const { project } = await m.createProject({ title: 'Gone', templates: ['novel'] });
    const bundle = { v: 1 as const, title: 'T', createdAt: 1, sections: [] };
    await createShare({ bundle, itemIds: ['i'], names: { unmarked: [], changed: [] } }, project.id, 7);
    await m.deleteProject(project.id);
    expect(await m.db.shares.count()).toBe(0);
  });
});
