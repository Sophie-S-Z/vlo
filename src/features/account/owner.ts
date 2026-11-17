import { accountRpc } from './auth';
import type { FeedbackKind } from './sendFeedback';

/*
 * The data of the owner page (Phase 18, Task A5, decision A6). Each call runs as the signed-in owner, and
 * the server refuses any other account. The answers hold counts, dates, emails and feedback, never a
 * project, a title or a word of writing.
 */

export interface OwnerSummary {
  accounts: number;
  accounts_7d: number;
  accounts_30d: number;
  /** Writers with Vlo on the screen in the last 15 minutes. */
  now: number;
  active_1d: number;
  active_7d: number;
  active_30d: number;
  active_prev_7d: number;
  /** Devices of the 7 days before this week that came back this week. */
  returning_7d: number;
  accounts_active_7d: number;
  accounts_active_30d: number;
  /** The words and projects on the newest count of each writer. */
  words_total: number;
  projects: number;
  syncing: number;
  spaces: number;
  sync_bytes: number;
  synced_at: string | null;
  shares: number;
  comments: number;
  rooms: number;
  db_bytes: number;
  installed: number;
  devices: Record<string, number>;
  versions: Record<string, number>;
  feedback: Record<string, number>;
  feedback_kinds: Record<string, number>;
  rating: number | null;
  ratings: number;
  reports: number;
  features: Record<string, number>;
  templates: Record<string, number>;
}

export interface OwnerDay {
  day: string;
  devices: number;
  accounts: number;
  /** Writers who added words on the day. A writer is an account, or a device with no account. */
  writers: number;
  words: number;
  new_devices: number;
  new_accounts: number;
  feedback: number;
}

export interface OwnerAccount {
  id: string;
  email: string;
  /** The name of the account's profile (migration 0011), or null before the writer gives one. */
  name: string | null;
  provider: string;
  created_at: string;
  last_sign_in_at: string | null;
  last_active: string | null;
  devices: number;
  syncing: boolean;
  feedback: number;
  days_30d: number;
  words_30d: number;
  words_total: number | null;
  projects: number | null;
}

/** Signed-out devices and the places of the devices of the last 30 days (migration 0010). */
export interface OwnerVisitors {
  signed_out_1d: number;
  signed_out_7d: number;
  signed_out_30d: number;
  /** The devices with a place. A count from a build with no place server has none. */
  located: number;
  /** Devices by country code, such as "US". */
  countries: Record<string, number>;
  /** Devices by country and region code, such as "US-CA". */
  regions: Record<string, number>;
  /** Devices by country, region and city, such as "US|CA|San Jose". */
  cities: Record<string, number>;
}

export type FeedbackStatus = 'new' | 'read' | 'planned' | 'done';

export interface OwnerFeedback {
  id: string;
  created_at: string;
  kind: FeedbackKind;
  message: string;
  rating: number | null;
  contact: string | null;
  email: string | null;
  app_version: string;
  device: string;
  place: string;
  status: FeedbackStatus;
  note: string;
  /** True when the owner blocked the sender of this message. */
  blocked: boolean;
}

export const isOwner = () => accountRpc<boolean>('is_owner');
/* `today` is the owner's local day, so the last day of the page is the owner's today. */
export const ownerSummary = (today: string) => accountRpc<OwnerSummary>('owner_summary', { p_today: today });
export const ownerDaily = (days: number, today: string) =>
  accountRpc<OwnerDay[]>('owner_daily', { p_days: days, p_today: today });
export const ownerAccounts = (today: string) =>
  accountRpc<OwnerAccount[]>('owner_accounts', { p_today: today });
export const ownerVisitors = (today: string) =>
  accountRpc<OwnerVisitors>('owner_visitors', { p_today: today });
export const ownerFeedback = () => accountRpc<OwnerFeedback[]>('owner_feedback');
export const setFeedbackStatus = (id: string, status: FeedbackStatus, note: string) =>
  accountRpc<boolean>('owner_set_feedback', { p_id: id, p_status: status, p_note: note });
/** Blocks or unblocks the sender of a message: its device, its account and its internet address. */
export const blockSender = (id: string, blocked: boolean) =>
  accountRpc<boolean>('owner_block_sender', { p_id: id, p_blocked: blocked });

/** One CSV field: quoted when it holds a comma, a quote or a line break. A formula start gets a quote. */
function csvField(value: string | number | null): string {
  let text = value === null ? '' : String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** The feedback as CSV, for a spreadsheet. */
export function feedbackCsv(rows: readonly OwnerFeedback[]): string {
  const head = [
    'date',
    'kind',
    'status',
    'rating',
    'message',
    'email',
    'reply to',
    'device',
    'version',
    'screen',
    'note',
    'blocked',
  ];
  const lines = rows.map((r) =>
    [
      r.created_at,
      r.kind,
      r.status,
      r.rating,
      r.message,
      r.email,
      r.contact,
      r.device,
      r.app_version,
      r.place,
      r.note,
      r.blocked ? 'yes' : 'no',
    ]
      .map(csvField)
      .join(','),
  );
  return [head.join(','), ...lines].join('\r\n') + '\r\n';
}

const COUNTRIES = new Intl.DisplayNames(['en'], { type: 'region' });

/** The English name of a country code, or the code when the name is not known. */
function countryName(code: string): string {
  try {
    return COUNTRIES.of(code) ?? code;
  } catch {
    return code;
  }
}

/** The names of the place keys of `OwnerVisitors`, such as "San Jose, CA, United States" for "US|CA|San Jose". */
export function placeLabels(counts: Record<string, number>): Record<string, string> {
  return Object.fromEntries(
    Object.keys(counts).map((key) => {
      const [country = '', region, city] = key.includes('|') ? key.split('|') : key.split('-');
      return [key, [city, region, countryName(country)].filter(Boolean).join(', ')];
    }),
  );
}

/** The entries of a count map, largest first. */
export function ranked(counts: Record<string, number>): [string, number][] {
  return Object.entries(counts).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

export type DayKey = Exclude<keyof OwnerDay, 'day'>;

/** The sum of `key` over `n` days, `skip` days back from the last day. */
export function total(days: readonly OwnerDay[], key: DayKey, n: number, skip = 0): number {
  return days.slice(Math.max(0, days.length - skip - n), days.length - skip).reduce((s, d) => s + d[key], 0);
}

/** One measure today, yesterday, on an average day of the 4 weeks before today, and on the best day. */
export function benchmarks(days: readonly OwnerDay[], key: DayKey) {
  return {
    today: days.at(-1)?.[key] ?? 0,
    yesterday: days.at(-2)?.[key] ?? 0,
    average: Math.round(total(days, key, 28, 1) / 28),
    best: days.reduce((b, d) => Math.max(b, d[key]), 0),
  };
}

/** The change from `before` to `now` in percent, or null when `before` is 0. */
export function change(now: number, before: number): number | null {
  return before === 0 ? null : Math.round(((now - before) / before) * 100);
}

/** Days in a row with words, up to today. A day with no words yet today does not break the run. */
export function writingStreak(days: readonly OwnerDay[]): number {
  let run = 0;
  for (let i = days.length - 1; i >= 0; i--) {
    if ((days[i]?.words ?? 0) > 0) run++;
    else if (i < days.length - 1) break;
  }
  return run;
}

/** The average words of each weekday, Monday first, over the days with any count. */
export function weekdayWords(days: readonly OwnerDay[]): number[] {
  const sums = Array.from({ length: 7 }, () => ({ words: 0, days: 0 }));
  for (const d of days) {
    const slot = sums[(new Date(`${d.day}T00:00:00Z`).getUTCDay() + 6) % 7];
    if (!slot || d.devices === 0) continue;
    slot.words += d.words;
    slot.days++;
  }
  return sums.map((s) => (s.days === 0 ? 0 : Math.round(s.words / s.days)));
}

export const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const NUMBER = new Intl.NumberFormat('en-GB');

/** Short facts about the numbers, in plain sentences. Each one shows only when its numbers exist. */
export function insights(summary: OwnerSummary, days: readonly OwnerDay[], dayText: (day: string) => string) {
  const n = (v: number) => NUMBER.format(v);
  const out: string[] = [];
  const today = days.at(-1)?.words ?? 0;
  const average = total(days, 'words', 28, 1) / 28;
  if (today > 0 && average > 0) {
    const ratio = today / average;
    out.push(
      ratio >= 1.1
        ? `Today has ${ratio.toFixed(1)} times the words of an average day in the last 4 weeks.`
        : `Today has ${String(Math.round(ratio * 100))}% of the words of an average day in the last 4 weeks.`,
    );
  }
  const best = days.reduce<OwnerDay | null>((b, d) => (d.words > (b?.words ?? 0) ? d : b), null);
  if (best) out.push(`The best day of the year had ${n(best.words)} words, on ${dayText(best.day)}.`);
  const run = writingStreak(days);
  if (run > 1) out.push(`Writers added words on ${n(run)} days in a row.`);
  const week = weekdayWords(days);
  const top = week.indexOf(Math.max(...week));
  if ((week[top] ?? 0) > 0)
    out.push(`${WEEKDAYS[top] ?? ''} is the strongest day, with ${n(week[top] ?? 0)} words on average.`);
  if (summary.active_prev_7d > 0)
    out.push(
      `${String(Math.round((summary.returning_7d / summary.active_prev_7d) * 100))}% of the devices from the week before came back this week.`,
    );
  const fresh = total(days, 'new_devices', 7);
  if (fresh > 0) out.push(`${n(fresh)} new ${fresh === 1 ? 'device' : 'devices'} opened Vlo this week.`);
  if (summary.active_30d > 0 && summary.installed > 0)
    out.push(
      `${String(Math.round((summary.installed / summary.active_30d) * 100))}% of this month's devices installed the app.`,
    );
  return out;
}
