import { rpc } from '@/features/share/rpc';
import { clock } from '@/lib/clock';
import { db, type AiMode, type Template } from '@/lib/db';

/*
 * Opt-in usage counts (spec F30 and section 11, plan Task E5, decision S6). They are off by default. While
 * they are on, Vlo counts feature uses, AI requests by mode and error codes on this device, by ISO week.
 * Once a week the Library shows the report of the last full week as exact JSON, and the writer sends it or
 * skips it. A report holds fixed names, counts and bands only: never text, titles or names. The names
 * come from the lists below, never from the writer's text.
 */

export const FEATURES = [
  'export-docx',
  'export-pdf',
  'export-epub',
  'export-markdown',
  'export-web',
  'backup',
  'backup-import',
  'snapshot-restore',
  'focus-mode',
  'share-create',
  'board',
  'timeline',
] as const;
export type FeatureName = (typeof FEATURES)[number];

export const ERROR_CODES = ['export-failed', 'backup-import-failed', 'share-failed', 'ai-failed'] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];

const AI_MODES: readonly AiMode[] = ['pen', 'reader', 'cowriter'];
const TEMPLATES: readonly Template[] = ['novel', 'memoir', 'poetry', 'open'];

export const BANDS = ['0', '1-249', '250-999', '1000-4999', '5000+'] as const;
export type Band = (typeof BANDS)[number];

export interface UsageReport {
  templates_used: Template[];
  words_added_band: Band;
  poems_added_band: Band;
  features_used: FeatureName[];
  ai_mode_counts: Partial<Record<AiMode, number>>;
  error_codes: Partial<Record<ErrorCode, number>>;
}

interface WeekCounts {
  features: Partial<Record<FeatureName, number>>;
  ai: Partial<Record<AiMode, number>>;
  errors: Partial<Record<ErrorCode, number>>;
}

export interface UsageState {
  on: boolean;
  /** The last week whose report the writer sent or skipped. */
  handledWeek?: string;
  /** The counts by ISO week, such as "2026-W45". Vlo keeps two weeks at most. */
  weeks: Record<string, WeekCounts>;
}

const KEY = 'usage';

export function band(n: number): Band {
  if (n <= 0) return '0';
  if (n < 250) return '1-249';
  if (n < 1000) return '250-999';
  if (n < 5000) return '1000-4999';
  return '5000+';
}

/** The ISO week of a time, in local time, as "YYYY-Www", with its first and last millisecond. */
export function isoWeek(at: number): { week: string; start: number; end: number } {
  const day = new Date(at);
  day.setHours(0, 0, 0, 0);
  const weekday = (day.getDay() + 6) % 7; // Monday is 0.
  const monday = new Date(day);
  monday.setDate(day.getDate() - weekday);
  const thursday = new Date(monday);
  thursday.setDate(monday.getDate() + 3);
  const year = thursday.getFullYear();
  const firstThursday = new Date(year, 0, 4);
  firstThursday.setDate(firstThursday.getDate() - ((firstThursday.getDay() + 6) % 7) + 3);
  const number = 1 + Math.round((thursday.getTime() - firstThursday.getTime()) / (7 * 86_400_000));
  const next = new Date(monday);
  next.setDate(monday.getDate() + 7);
  return {
    week: `${String(year)}-W${String(number).padStart(2, '0')}`,
    start: monday.getTime(),
    end: next.getTime() - 1,
  };
}

/** The last full ISO week before the week of `now`. */
export function lastWeek(now: number): { week: string; start: number; end: number } {
  return isoWeek(isoWeek(now).start - 1);
}

function isState(value: unknown): value is UsageState {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as UsageState).on === 'boolean' &&
    typeof (value as UsageState).weeks === 'object'
  );
}

export async function usageState(): Promise<UsageState> {
  const value = (await db.appMeta.get(KEY))?.value;
  return isState(value) ? value : { on: false, weeks: {} };
}

/** Turns usage counts on or off. Off removes every local count. */
export async function setUsageOn(on: boolean): Promise<void> {
  await db.transaction('rw', db.appMeta, async () => {
    const state = await usageState();
    // A writer who turns counts on now has nothing to send for last week.
    const next: UsageState = on
      ? { on: true, handledWeek: lastWeek(clock.now()).week, weeks: {} }
      : { on: false, weeks: {} };
    if (on && state.on) return;
    await db.appMeta.put({ key: KEY, value: next });
  });
}

async function count(change: (week: WeekCounts) => void): Promise<void> {
  await db.transaction('rw', db.appMeta, async () => {
    const state = await usageState();
    if (!state.on) return;
    const now = clock.now();
    const { week } = isoWeek(now);
    const keep = new Set([week, lastWeek(now).week]);
    const weeks = Object.fromEntries(Object.entries(state.weeks).filter(([w]) => keep.has(w)));
    const counts = weeks[week] ?? { features: {}, ai: {}, errors: {} };
    change(counts);
    weeks[week] = counts;
    await db.appMeta.put({ key: KEY, value: { ...state, weeks } });
  });
}

/** The counts wait in one line, so two counts at once never lose one. */
let queue: Promise<void> = Promise.resolve();

function enqueue(change: (week: WeekCounts) => void): void {
  queue = queue.then(() => count(change)).catch(() => undefined);
}

/** Resolves when every count so far is stored. */
export function usageSettled(): Promise<void> {
  return queue;
}

/** Counts one use of a feature. It does nothing while usage counts are off, and it never fails. */
export function recordFeature(name: FeatureName): void {
  enqueue((w) => {
    w.features[name] = (w.features[name] ?? 0) + 1;
  });
}

/** Counts one error. It does nothing while usage counts are off, and it never fails. */
export function recordError(code: ErrorCode): void {
  enqueue((w) => {
    w.errors[code] = (w.errors[code] ?? 0) + 1;
  });
}

/** Counts one AI request in a mode. It does nothing while usage counts are off, and it never fails. */
export function recordAiRequest(mode: AiMode): void {
  enqueue((w) => {
    w.ai[mode] = (w.ai[mode] ?? 0) + 1;
  });
}

/**
 * The report of the last full week, or null when counts are off, the writer already sent or skipped it,
 * or the week had no writing and no counts.
 */
export async function weeklyReport(now: number): Promise<{ week: string; report: UsageReport } | null> {
  const state = await usageState();
  if (!state.on) return null;
  const { week, start, end } = lastWeek(now);
  if (state.handledWeek !== undefined && state.handledWeek >= week) return null;
  const sessions = await db.sessions.filter((s) => s.startedAt >= start && s.startedAt <= end).toArray();
  const counts = state.weeks[week] ?? { features: {}, ai: {}, errors: {} };
  const active = new Set(sessions.map((s) => s.projectId));
  const projects = await db.projects.bulkGet([...active]);
  const words = sessions.reduce((n, s) => n + s.wordsAdded, 0);
  const poems = sessions.reduce((n, s) => n + s.poemsAdded, 0);
  const report: UsageReport = {
    templates_used: TEMPLATES.filter((t) => projects.some((p) => p?.templates.includes(t))),
    words_added_band: band(words),
    poems_added_band: band(poems),
    features_used: FEATURES.filter((f) => (counts.features[f] ?? 0) > 0),
    ai_mode_counts: Object.fromEntries(
      AI_MODES.filter((m) => (counts.ai[m] ?? 0) > 0).map((m) => [m, counts.ai[m]]),
    ),
    error_codes: Object.fromEntries(
      ERROR_CODES.filter((c) => (counts.errors[c] ?? 0) > 0).map((c) => [c, counts.errors[c]]),
    ),
  };
  const empty =
    sessions.length === 0 &&
    report.features_used.length === 0 &&
    Object.keys(report.ai_mode_counts).length === 0 &&
    Object.keys(report.error_codes).length === 0;
  return empty ? null : { week, report };
}

/** Marks the week as sent or skipped, so the Library does not ask again. */
export async function handleWeek(week: string): Promise<void> {
  await db.transaction('rw', db.appMeta, async () => {
    const state = await usageState();
    if (!state.on) return;
    const weeks = Object.fromEntries(Object.entries(state.weeks).filter(([w]) => w > week));
    await db.appMeta.put({ key: KEY, value: { ...state, handledWeek: week, weeks } });
  });
}

/** The app version for submit_usage. */
export const APP_VERSION: string = (import.meta.env.VITE_APP_VERSION as string | undefined) ?? '0.0.0';

/** Sends the report exactly as the writer saw it, then marks the week. */
export async function sendReport(week: string, report: UsageReport): Promise<void> {
  await rpc('submit_usage', { p_week: week, p_app_version: APP_VERSION, p_report: report }, 'usage');
  await handleWeek(week);
}
