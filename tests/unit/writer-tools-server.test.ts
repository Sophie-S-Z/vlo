import { afterEach, beforeEach, expect, test, vi } from 'vitest';

/* ADR 0013: the toolbar and the keys follow the account, and the newer copy wins. */

const calls: { name: string; args: unknown }[] = [];
let server: { settings: unknown; changed_at: number } | null = null;

vi.mock('@/features/account/auth', () => ({
  accountRpc: (name: string, args: { p_settings?: unknown; p_changed_at?: number } = {}) => {
    calls.push({ name, args });
    if (name === 'writer_settings_get') return Promise.resolve(server ? [server] : []);
    // As migration 0015: the server keeps only a copy from a later change.
    const at = args.p_changed_at ?? 0;
    if (server && server.changed_at >= at) return Promise.resolve(false);
    server = { settings: args.p_settings, changed_at: at };
    return Promise.resolve(true);
  },
}));

const { followWriterTools } = await import('@/features/account/writerToolsServer');
const { getWriterTools, resetWriterTools, setWriterTools } = await import('@/features/editor/writerTools');

beforeEach(() => {
  vi.useFakeTimers();
  calls.length = 0;
  server = null;
  resetWriterTools();
});
afterEach(() => {
  vi.useRealTimers();
});

test('a refused copy brings the newer copy from the server', async () => {
  const stop = followWriterTools();
  await vi.runAllTimersAsync();
  setWriterTools({ toolbar: ['bold'] });
  // Another device saved a later change in the meantime.
  server = { settings: { toolbar: ['italic'], keys: {} }, changed_at: getWriterTools().updatedAt + 1 };
  await vi.runAllTimersAsync();
  expect(calls.map((c) => c.name)).toEqual([
    'writer_settings_get',
    'writer_settings_put',
    'writer_settings_get',
  ]);
  expect(getWriterTools().toolbar).toEqual(['italic']);
  stop();
});

test('a sign-out gives Vlo’s own toolbar and keys, so the next account takes none', () => {
  setWriterTools({ toolbar: ['bold'], keys: { bold: 'Mod-Shift-x' } });
  resetWriterTools();
  expect(getWriterTools()).toEqual({ toolbar: null, keys: {}, updatedAt: 0 });
});
