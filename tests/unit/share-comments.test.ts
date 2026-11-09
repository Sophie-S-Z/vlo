import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { newShareKey, sealJson } from '@/lib/crypto';

/* Plan Task E4 (spec section 11, Review Focus 4): reader comments are sealed, and checked before they show. */

const SHARE_ID = '3f2a7b1c-9d4e-4f60-8a1b-2c3d4e5f6a7b';

type Modules = typeof import('@/features/share/comments') & { db: typeof import('@/lib/db').db };
let m: Modules;
let calls: { name: string; body: Record<string, unknown> }[] = [];
let rows: unknown = [];

beforeEach(async () => {
  vi.resetModules();
  vi.stubEnv('VITE_SUPABASE_URL', 'https://vlo-test.supabase.co');
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon-key');
  calls = [];
  rows = [];
  vi.stubGlobal(
    'fetch',
    vi.fn((url: URL | string, init: RequestInit) => {
      const name = url.toString().split('/').at(-1) ?? '';
      calls.push({ name, body: JSON.parse(init.body as string) as Record<string, unknown> });
      return Promise.resolve(Response.json(name === 'add_comment' ? 'comment-id' : rows));
    }),
  );
  m = { ...(await import('@/features/share/comments')), db: (await import('@/lib/db')).db };
  await m.db.open();
});

afterEach(async () => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  await m.db.delete();
});

const good = {
  v: 1,
  section: 0,
  block: 2,
  quote: 'The harbour lights',
  name: 'Ines',
  text: 'Lovely.',
  at: 5,
};

/** The link of the version 2 tests: one question, and on the reader's device the text of each block. */
const LIMITS = { questions: 1, blocks: [['', '', 'The harbour lights came on one by one.']] };
const words = { ...good, v: 2, quote: 'lights came', start: 12, end: 23, reaction: 'moved' };

describe('parseComment', () => {
  test('takes a comment that Vlo makes, and trims an empty name away', () => {
    expect(m.parseComment(good, LIMITS)).toEqual(good);
    const noName = m.parseComment({ ...good, name: '  ' }, LIMITS);
    expect(noName).not.toHaveProperty('name');
    expect(noName?.text).toBe('Lovely.');
  });

  test('takes a version 2 comment on words, a reaction with no text, and an answer', () => {
    expect(m.parseComment(words, LIMITS)).toEqual(words);
    // The writer's device has no bundle, so it checks the words against their offsets only.
    expect(m.parseComment(words, { questions: 0 })).toEqual(words);
    const reaction = { ...good, v: 2, text: '', reaction: 'funny' };
    expect(m.parseComment(reaction, LIMITS)).toEqual(reaction);
    const answer = { ...good, v: 2, quote: '', question: 0, text: 'The ending.' };
    expect(m.parseComment(answer, LIMITS)).toEqual(answer);
  });

  test.each([
    ['another version', { ...good, v: 3 }],
    ['an unknown reaction', { ...words, reaction: 'angry' }],
    ['a start after the end', { ...words, start: 23, end: 12 }],
    ['a start with no end', { ...words, end: undefined }],
    ['an end past the block', { ...words, start: 30, end: 41 }],
    ['offsets that do not hold the quote', { ...words, start: 11, end: 22 }],
    ['a block that the link does not have', { ...words, block: 7 }],
    ['a question index past the questions', { ...good, v: 2, question: 1 }],
    ['an answer with a reaction', { ...good, v: 2, question: 0, reaction: 'loved' }],
    ['an answer over the limit', { ...good, v: 2, question: 0, text: 'x'.repeat(2001) }],
    ['no text and no reaction', { ...good, v: 2, text: ' ' }],
    ['a negative block', { ...good, block: -1 }],
    ['a block that is not a whole number', { ...good, block: 1.5 }],
    ['an empty text', { ...good, text: '   ' }],
    ['a text over the limit', { ...good, text: 'x'.repeat(2001) }],
    ['a name over the limit', { ...good, name: 'x'.repeat(81) }],
    ['a number for the name', { ...good, name: 7 }],
    ['a quote over the limit', { ...good, quote: 'x'.repeat(201) }],
    ['no time', { ...good, at: 'now' }],
    ['an array', [good]],
    ['null', null],
  ])('refuses %s', (_name, value) => {
    expect(m.parseComment(value, LIMITS)).toBeNull();
  });
});

describe('sending and reading', () => {
  test('a comment goes sealed, with its text in no field', async () => {
    const { key } = await newShareKey();
    await m.sendComment(SHARE_ID, key, { ...good, v: 1 });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.name).toBe('add_comment');
    expect(Object.keys(calls[0]?.body ?? {}).sort()).toEqual(['p_iv', 'p_payload', 'p_share_id']);
    expect(JSON.stringify(calls[0]?.body)).not.toMatch(/Lovely|Ines|harbour/);
  });

  test('reading leaves out a comment with another key, a crafted one and a broken row', async () => {
    const { key } = await newShareKey();
    const { key: other } = await newShareKey();
    const ok = await sealJson(good, key, 'comment');
    const later = await sealJson({ ...good, text: 'Second.', at: 9 }, key, 'comment');
    const foreign = await sealJson(good, other, 'comment');
    const crafted = await sealJson(
      { ...good, text: { html: '<img src=x onerror=alert(1)>' } },
      key,
      'comment',
    );
    rows = [
      { id: 'b', ...later, created_at: '2026-11-07T10:00:00Z' },
      { id: 'a', ...ok, created_at: '2026-11-07T09:00:00Z' },
      { id: 'c', ...foreign, created_at: '2026-11-07T09:30:00Z' },
      { id: 'd', ...crafted, created_at: '2026-11-07T09:40:00Z' },
      { id: 'e', payload: 7, iv: 'x', created_at: '' },
      'not a row',
    ];
    const listed = await m.readComments(SHARE_ID, key, LIMITS);
    expect(listed.map((c) => c.id)).toEqual(['a', 'b']);
    expect(listed[0]?.at).toBe(Date.parse('2026-11-07T09:00:00Z'));
    expect(listed[1]?.comment.text).toBe('Second.');
  });

  test('the writer keeps the comments of a link in its record', async () => {
    const { key, text } = await newShareKey();
    const answer = { ...good, v: 2, quote: '', question: 0, text: 'The ending.' };
    rows = [
      { id: 'a', ...(await sealJson(good, key, 'comment')), created_at: '2026-11-07T09:00:00Z' },
      { id: 'b', ...(await sealJson(words, key, 'comment')), created_at: '2026-11-07T09:10:00Z' },
      { id: 'c', ...(await sealJson(answer, key, 'comment')), created_at: '2026-11-07T09:20:00Z' },
    ];
    await m.db.shares.add({
      id: SHARE_ID,
      projectId: 'p',
      itemIds: [],
      title: 'T',
      createdAt: 0,
      expiresAt: Date.now() + 86_400_000,
      ownerToken: 'o',
      key: text,
      revoked: false,
      questions: ['What did you feel at the end?'],
      comments: [],
      commentsReadAt: 0,
    });
    const record = await m.db.shares.get(SHARE_ID);
    if (!record) throw new Error('No record.');
    await m.refreshComments(record);
    const stored = await m.db.shares.get(SHARE_ID);
    expect(stored?.comments).toEqual([
      {
        id: 'a',
        section: 0,
        block: 2,
        quote: 'The harbour lights',
        name: 'Ines',
        text: 'Lovely.',
        at: Date.parse('2026-11-07T09:00:00Z'),
      },
      {
        id: 'b',
        section: 0,
        block: 2,
        quote: 'lights came',
        start: 12,
        end: 23,
        reaction: 'moved',
        name: 'Ines',
        text: 'Lovely.',
        at: Date.parse('2026-11-07T09:10:00Z'),
      },
      {
        id: 'c',
        section: 0,
        block: 2,
        quote: '',
        question: 0,
        name: 'Ines',
        text: 'The ending.',
        at: Date.parse('2026-11-07T09:20:00Z'),
      },
    ]);
    expect(stored?.commentsReadAt).toBeGreaterThan(0);
    expect(calls.map((c) => c.body)).toEqual([{ p_share_id: SHARE_ID }]);
  });
});
