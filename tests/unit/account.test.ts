import { describe, expect, it } from 'vitest';
import { sendDailyCount } from '@/features/account/dailyCount';
import { installId, readDailyCount, setDailyCountOn } from '@/features/account/dailyCountState';
import { feedbackCsv, ranked, type OwnerFeedback } from '@/features/account/owner';
import { placeOf } from '@/features/account/sendFeedback';
import { passphraseProblem, unwrapSyncKey, wrapSyncKey } from '@/features/account/vault';
import { CryptoError, newShareKey } from '@/lib/crypto';

/* Phase 18 (decisions A1, A3, A5 and A6): the sealed sync key, the daily count, feedback and its CSV. */

describe('the sealed sync key (decision A1)', () => {
  // Fewer rounds keep the test fast. The server refuses fewer than 100,000.
  const ROUNDS = 1_000;

  it('wraps a key that only the same passphrase opens, with the shapes that vault_put checks', async () => {
    const { text } = await newShareKey();
    const vault = await wrapSyncKey(text, 'the harbour at night', ROUNDS);
    expect(vault.wrapped).toMatch(/^[A-Za-z0-9+/]{64}$/);
    expect(vault.iv).toMatch(/^[A-Za-z0-9+/]{16}$/);
    expect(vault.salt).toMatch(/^[A-Za-z0-9+/]{22}==$/);
    await expect(unwrapSyncKey(vault, 'the harbour at night')).resolves.toBe(text);
    await expect(unwrapSyncKey(vault, 'the harbour at noon')).rejects.toBeInstanceOf(CryptoError);
  });

  it('gives a new salt and IV each time, and reads a passphrase in NFKC form', async () => {
    const { text } = await newShareKey();
    const a = await wrapSyncKey(text, 'café au lait', ROUNDS);
    const b = await wrapSyncKey(text, 'café au lait', ROUNDS);
    expect(a.salt).not.toBe(b.salt);
    expect(a.wrapped).not.toBe(b.wrapped);
    await expect(unwrapSyncKey(a, 'café au lait')).resolves.toBe(text);
  });

  it('asks for 8 characters and the same passphrase twice', () => {
    expect(passphraseProblem('short', 'short')).toMatch(/at least 8/);
    expect(passphraseProblem('long enough', 'long enougH')).toMatch(/not the same/);
    expect(passphraseProblem('long enough', 'long enough')).toBe('');
  });
});

describe('the daily count (decision A3)', () => {
  it('is on by default, keeps one install id, and off forgets it', () => {
    localStorage.clear();
    expect(readDailyCount().off).toBe(false);
    const id = installId();
    expect(id).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(installId()).toBe(id);
    setDailyCountOn(false);
    expect(readDailyCount()).toEqual({ off: true });
    setDailyCountOn(true);
    expect(installId()).not.toBe(id);
  });

  it('sends nothing in a build with no Supabase project', async () => {
    localStorage.clear();
    await expect(sendDailyCount()).resolves.toBe(false);
  });
});

describe('feedback (decisions A5 and A6)', () => {
  it('names the screen that the writer came from with safe characters', () => {
    expect(placeOf('/settings')).toBe('settings');
    expect(placeOf('/p/abc/board')).toBe('project');
    expect(placeOf('')).toBe('library');
    expect(placeOf('/Ünïcode!')).toBe('ncode');
  });

  it('makes a CSV that a spreadsheet cannot run as a formula', () => {
    const row: OwnerFeedback = {
      id: '1',
      created_at: '2026-11-13T10:00:00Z',
      kind: 'idea',
      message: '=HYPERLINK("x")\nand, more',
      rating: 5,
      contact: null,
      email: 'a@example.com',
      app_version: '0.1.0',
      device: 'phone',
      place: 'settings',
      status: 'new',
      note: '',
    };
    const csv = feedbackCsv([row]);
    expect(csv.split('\r\n')[0]).toBe(
      'date,kind,status,rating,message,email,reply to,device,version,screen,note',
    );
    expect(csv).toContain('"\'=HYPERLINK(""x"")\nand, more"');
    expect(ranked({ b: 1, a: 3, c: 1 })).toEqual([
      ['a', 3],
      ['b', 1],
      ['c', 1],
    ]);
  });
});
