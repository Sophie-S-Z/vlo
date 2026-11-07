import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

/*
 * Plan Task E5 (spec F30, decision S6): opt-in usage counts. Off by default, bands and fixed names only, no
 * text, title or name, under 4 KB, and the sent body is the report the writer saw.
 */

type Modules = typeof import('@/features/usage/usage') & {
  db: typeof import('@/lib/db').db;
  clock: typeof import('@/lib/clock').clock;
};
let m: Modules;
let calls: { name: string; body: Record<string, unknown> }[] = [];

/** Wednesday 11 November 2026, noon: week 2026-W46. The last full week is 2026-W45. */
const NOW = new Date(2026, 10, 11, 12).getTime();
const LAST_WEEK = new Date(2026, 10, 4, 12).getTime();

beforeEach(async () => {
  vi.resetModules();
  vi.stubEnv('VITE_SUPABASE_URL', 'https://vlo-test.supabase.co');
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon-key');
  calls = [];
  vi.stubGlobal(
    'fetch',
    vi.fn((url: URL | string, init: RequestInit) => {
      calls.push({
        name: url.toString().split('/').at(-1) ?? '',
        body: JSON.parse(init.body as string) as Record<string, unknown>,
      });
      return Promise.resolve(Response.json('report-id'));
    }),
  );
  m = {
    ...(await import('@/features/usage/usage')),
    db: (await import('@/lib/db')).db,
    clock: (await import('@/lib/clock')).clock,
  };
  await m.db.open();
});

afterEach(async () => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  await m.db.delete();
});

function at(time: number) {
  vi.spyOn(m.clock, 'now').mockReturnValue(time);
}

/** A library with titles, people's names and text, and sessions last week. */
async function fixtureLibrary() {
  const base = { aiMode: 'pen' as const, createdAt: 0, updatedAt: 0 };
  const settings = { snapshotEveryMinutes: 10, aliasAiRequests: true, streaksEnabled: false, restDays: [] };
  await m.db.projects.bulkAdd([
    { ...base, id: 'p1', title: 'Summers with Rosa', template: 'memoir', authorName: 'Ada Marlow', settings },
    { ...base, id: 'p2', title: 'Tide Tables', template: 'poetry', settings },
    { ...base, id: 'p3', title: 'Quiet Novel', template: 'novel', settings },
  ]);
  await m.db.itemTexts.bulkAdd([
    { itemId: 'i1', projectId: 'p1', text: 'Aunt Rosa drove us to the coast every August.', updatedAt: 0 },
    { itemId: 'i2', projectId: 'p2', text: 'Salt on the windowsill, the tide going out.', updatedAt: 0 },
  ]);
  await m.db.sessions.bulkAdd([
    {
      id: 's1',
      projectId: 'p1',
      startedAt: LAST_WEEK,
      endedAt: LAST_WEEK + 1,
      wordsAdded: 900,
      poemsAdded: 0,
    },
    {
      id: 's2',
      projectId: 'p2',
      startedAt: LAST_WEEK,
      endedAt: LAST_WEEK + 1,
      wordsAdded: 200,
      poemsAdded: 3,
    },
    // This week, so not in last week's report.
    { id: 's3', projectId: 'p3', startedAt: NOW, endedAt: NOW + 1, wordsAdded: 50_000, poemsAdded: 0 },
  ]);
}

describe('bands and weeks', () => {
  test.each([
    [0, '0'],
    [1, '1-249'],
    [249, '1-249'],
    [250, '250-999'],
    [999, '250-999'],
    [1000, '1000-4999'],
    [4999, '1000-4999'],
    [5000, '5000+'],
  ])('%i words is %s', (n, band) => {
    expect(m.band(n)).toBe(band);
  });

  test('ISO weeks at the year ends', () => {
    expect(m.isoWeek(new Date(2026, 0, 1, 12).getTime()).week).toBe('2026-W01');
    expect(m.isoWeek(new Date(2024, 11, 30, 12).getTime()).week).toBe('2025-W01');
    expect(m.isoWeek(new Date(2027, 0, 1, 12).getTime()).week).toBe('2026-W53');
    expect(m.lastWeek(NOW).week).toBe('2026-W45');
  });
});

describe('usage counts', () => {
  test('are off by default: no count, no report and no request', async () => {
    await fixtureLibrary();
    at(LAST_WEEK);
    m.recordFeature('export-docx');
    m.recordError('export-failed');
    await m.usageSettled();
    expect(await m.db.appMeta.get('usage')).toBeUndefined();
    expect(await m.weeklyReport(NOW)).toBeNull();
    expect(calls).toHaveLength(0);
  });

  test('a report holds bands and fixed names only, and no title, name or word of text', async () => {
    await fixtureLibrary();
    at(LAST_WEEK - 7 * 86_400_000);
    await m.setUsageOn(true);
    at(LAST_WEEK);
    m.recordFeature('export-docx');
    m.recordFeature('export-docx');
    m.recordFeature('focus-mode');
    m.recordAiRequest('pen');
    m.recordAiRequest('reader');
    m.recordAiRequest('pen');
    m.recordError('export-failed');
    await m.usageSettled();

    const result = await m.weeklyReport(NOW);
    expect(result?.week).toBe('2026-W45');
    expect(result?.report).toEqual({
      templates_used: ['memoir', 'poetry'],
      words_added_band: '1000-4999',
      poems_added_band: '1-249',
      features_used: ['export-docx', 'focus-mode'],
      ai_mode_counts: { pen: 2, reader: 1 },
      error_codes: { 'export-failed': 1 },
    });

    const json = JSON.stringify(result?.report).toLowerCase();
    const projects = await m.db.projects.toArray();
    const texts = await m.db.itemTexts.toArray();
    const words = [
      ...projects.flatMap((p) => [p.title, p.authorName ?? '']),
      ...texts.map((t) => t.text),
    ].flatMap((t) => t.toLowerCase().match(/[a-z]{4,}/g) ?? []);
    expect(words.length).toBeGreaterThan(10);
    for (const word of words) expect(json).not.toContain(word);
  });

  test('a report with every feature and error code stays under 4 KB', async () => {
    at(LAST_WEEK - 7 * 86_400_000);
    await m.setUsageOn(true);
    at(LAST_WEEK);
    for (let i = 0; i < 999; i++) {
      for (const f of m.FEATURES) m.recordFeature(f);
      for (const c of m.ERROR_CODES) m.recordError(c);
      for (const mode of ['pen', 'reader', 'cowriter'] as const) m.recordAiRequest(mode);
    }
    await m.usageSettled();
    const result = await m.weeklyReport(NOW);
    expect(result?.report.features_used).toEqual([...m.FEATURES]);
    expect(new TextEncoder().encode(JSON.stringify(result?.report)).length).toBeLessThan(4096);
  });

  test('Send gives the shown report as it is, and the week does not come back', async () => {
    await fixtureLibrary();
    at(LAST_WEEK - 7 * 86_400_000);
    await m.setUsageOn(true);
    const result = await m.weeklyReport(NOW);
    if (!result) throw new Error('No report.');
    const shown = JSON.stringify(result.report, null, 2);
    await m.sendReport(result.week, result.report);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.name).toBe('submit_usage');
    expect(calls[0]?.body).toEqual({
      p_week: '2026-W45',
      p_app_version: m.APP_VERSION,
      p_report: result.report,
    });
    expect(JSON.stringify(calls[0]?.body.p_report, null, 2)).toBe(shown);
    expect(await m.weeklyReport(NOW)).toBeNull();
  });

  test('Skip this week sends nothing, and turning counts off removes them', async () => {
    await fixtureLibrary();
    at(LAST_WEEK - 7 * 86_400_000);
    await m.setUsageOn(true);
    at(LAST_WEEK);
    m.recordFeature('board');
    await m.usageSettled();
    await m.handleWeek('2026-W45');
    expect(await m.weeklyReport(NOW)).toBeNull();
    expect(calls).toHaveLength(0);

    at(NOW);
    m.recordFeature('timeline');
    await m.usageSettled();
    expect(Object.keys((await m.usageState()).weeks)).toEqual(['2026-W46']);
    await m.setUsageOn(false);
    expect(await m.usageState()).toEqual({ on: false, weeks: {} });
  });

  test('turning counts on does not ask about the week before', async () => {
    await fixtureLibrary();
    at(NOW);
    await m.setUsageOn(true);
    expect(await m.weeklyReport(NOW)).toBeNull();
  });
});
