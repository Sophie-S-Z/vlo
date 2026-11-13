import { accountRpc } from './auth';

/*
 * The data of the owner page (Phase 18, Task A5, decision A6). Each call runs as the signed-in owner, and
 * the server refuses any other account. The answers hold counts, dates, emails and feedback, never a
 * project, a title or a word of writing.
 */

export interface OwnerSummary {
  accounts: number;
  accounts_7d: number;
  accounts_30d: number;
  active_1d: number;
  active_7d: number;
  active_30d: number;
  accounts_active_7d: number;
  accounts_active_30d: number;
  syncing: number;
  spaces: number;
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
  words: Record<string, number>;
}

export interface OwnerDay {
  day: string;
  devices: number;
  accounts: number;
  new_accounts: number;
  feedback: number;
}

export interface OwnerAccount {
  id: string;
  email: string;
  provider: string;
  created_at: string;
  last_sign_in_at: string | null;
  last_active: string | null;
  devices: number;
  syncing: boolean;
  feedback: number;
}

export type FeedbackStatus = 'new' | 'read' | 'planned' | 'done';

export interface OwnerFeedback {
  id: string;
  created_at: string;
  kind: 'idea' | 'problem' | 'praise' | 'question';
  message: string;
  rating: number | null;
  contact: string | null;
  email: string | null;
  app_version: string;
  device: string;
  place: string;
  status: FeedbackStatus;
  note: string;
}

export const isOwner = () => accountRpc<boolean>('is_owner');
export const ownerSummary = () => accountRpc<OwnerSummary>('owner_summary');
export const ownerDaily = (days: number) => accountRpc<OwnerDay[]>('owner_daily', { p_days: days });
export const ownerAccounts = () => accountRpc<OwnerAccount[]>('owner_accounts');
export const ownerFeedback = () => accountRpc<OwnerFeedback[]>('owner_feedback');
export const setFeedbackStatus = (id: string, status: FeedbackStatus, note: string) =>
  accountRpc<boolean>('owner_set_feedback', { p_id: id, p_status: status, p_note: note });

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
    ]
      .map(csvField)
      .join(','),
  );
  return [head.join(','), ...lines].join('\r\n') + '\r\n';
}

/** The entries of a count map, largest first. */
export function ranked(counts: Record<string, number>): [string, number][] {
  return Object.entries(counts).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}
