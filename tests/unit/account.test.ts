import { describe, expect, it } from 'vitest';
import { refusal } from '@/features/account/auth';
import { sendDailyCount } from '@/features/account/dailyCount';
import { installId, readDailyCount, setDailyCountOn } from '@/features/account/dailyCountState';
import { feedbackCsv, ranked, type OwnerFeedback } from '@/features/account/owner';
import { placeOf } from '@/features/account/sendFeedback';

/* Phase 18 (decisions A3, A5 and A6): the daily count, feedback and its CSV. */

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

describe('a refused sign-in request', () => {
  it('signs out only when the server refuses the refresh token itself', () => {
    expect(refusal('token?grant_type=refresh_token', 400, 'refresh_token_not_found')).toBe('signed-out');
    expect(refusal('token?grant_type=refresh_token', 403, '')).toBe('signed-out');
    // A fault of the server keeps the session, whatever its message says.
    expect(refusal('token?grant_type=refresh_token', 500, 'token not found in cache')).toBe('server');
    expect(refusal('token?grant_type=refresh_token', 503, '')).toBe('server');
  });

  it('calls a code wrong only on the code paths', () => {
    expect(refusal('verify', 403, 'otp_expired Token has expired or is invalid')).toBe('bad-code');
    expect(refusal('token?grant_type=pkce', 400, 'invalid flow state')).toBe('bad-code');
    expect(refusal('verify', 502, '')).toBe('server');
  });

  it('names a refused address or a failed email when Vlo asks for a code', () => {
    expect(refusal('otp', 400, 'email_address_invalid')).toBe('bad-email');
    expect(refusal('otp', 400, 'email_address_not_authorized')).toBe('mail');
    expect(refusal('otp', 500, 'Error sending magic link email')).toBe('mail');
    expect(refusal('otp', 429, 'over_email_send_rate_limit')).toBe('too-many');
  });
});
