import { describe, expect, it } from 'vitest';
import { passwordProblem, refusal } from '@/features/account/auth';
import { sendDailyCount, writingNumbers } from '@/features/account/dailyCount';
import { installId, readDailyCount, setDailyCountOn } from '@/features/account/dailyCountState';
import { benchmarks, feedbackCsv, ranked, type OwnerDay, type OwnerFeedback } from '@/features/account/owner';
import { placeOf } from '@/features/account/sendFeedback';
import { createProject } from '@/features/library/projects';
import { db } from '@/lib/db';

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

  it("counts today's words of every project, the words on the device and the projects", async () => {
    await db.open();
    try {
      const { project } = await createProject({ title: 'Salt Year', templates: ['novel'] });
      await createProject({ title: 'Tide', templates: ['poetry'] });
      await db.projects.update(project.id, {
        settings: { ...project.settings, wordsByDay: { '2026-11-16': 340, '2026-11-15': 900 } },
      });
      await db.items.where('projectId').equals(project.id).modify({ wordCount: 1200 });
      const items = await db.items.where('projectId').equals(project.id).count();
      expect(await writingNumbers('2026-11-16')).toEqual({ words: 340, total: 1200 * items, projects: 2 });
    } finally {
      await db.delete();
    }
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
      blocked: false,
    };
    const csv = feedbackCsv([row]);
    expect(csv.split('\r\n')[0]).toBe(
      'date,kind,status,rating,message,email,reply to,device,version,screen,note,blocked',
    );
    expect(csv).toContain('"\'=HYPERLINK(""x"")\nand, more"');
    expect(ranked({ b: 1, a: 3, c: 1 })).toEqual([
      ['a', 3],
      ['b', 1],
      ['c', 1],
    ]);
  });
});

describe('the daily benchmarks of the owner page', () => {
  it('gives today, yesterday, an average day of the 4 weeks before today and the best day', () => {
    const day = (words: number): OwnerDay => ({
      day: '2026-11-16',
      devices: 0,
      accounts: 0,
      writers: 0,
      words,
      new_devices: 0,
      new_accounts: 0,
      feedback: 0,
    });
    const days = [day(5000), ...Array.from({ length: 28 }, () => day(100)), day(30), day(40)];
    // The 28 days before today are 27 days of 100 and yesterday. The best day is older than those.
    expect(benchmarks(days, 'words')).toEqual({ today: 40, yesterday: 30, average: 98, best: 5000 });
    expect(benchmarks([], 'words')).toEqual({ today: 0, yesterday: 0, average: 0, best: 0 });
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

  it('names a wrong password, a weak or same password, and a password change that needs a code', () => {
    expect(refusal('token?grant_type=password', 400, 'invalid_credentials')).toBe('bad-password');
    expect(refusal('token?grant_type=password', 500, '')).toBe('server');
    expect(refusal('user', 422, 'weak_password')).toBe('weak-password');
    expect(refusal('user', 422, 'same_password')).toBe('same-password');
    expect(refusal('user', 400, 'reauthentication_needed')).toBe('needs-code');
    expect(refusal('user', 400, 'reauthentication_not_valid')).toBe('bad-code');
  });

  it('checks a new password before it goes', () => {
    expect(passwordProblem('short', 'short')).toBe('Use at least 8 characters.');
    expect(passwordProblem('x'.repeat(73), 'x'.repeat(73))).toBe('Use at most 72 characters.');
    expect(passwordProblem('salt and harbour', 'salt and harbor')).toMatch(/not the same/);
    expect(passwordProblem('salt and harbour', 'salt and harbour')).toBe('');
  });
});
