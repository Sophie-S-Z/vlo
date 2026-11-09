import { clockKey, type SyncTable } from './clock';

/*
 * The merge of synced rows (decision R6, ADR 0008). Pure: no database, no clock. For each row the newer
 * change wins. A project row also keeps the larger word count of each day from both devices.
 */

/** A row as one device has it, with the time of its last change. No `row` means that a delete removed it. */
export interface Version {
  table: SyncTable;
  id: string;
  at: number;
  row?: Record<string, unknown>;
}

export interface Plan {
  /** The other device's versions that win, to write with their own times. */
  take: Version[];
  /** This device's project rows, which win but take more words for a day. They keep their times. */
  keep: Version[];
}

type Days = Record<string, number>;

const daysOf = (row: Record<string, unknown>): Days =>
  (row.settings as { wordsByDay?: Days } | undefined)?.wordsByDay ?? {};

/** `winner` with the larger count of each day of both rows, or `winner` itself when it has them all. */
function withDays(winner: Version, a: Record<string, unknown>, b: Record<string, unknown>): Version {
  const row = winner.row ?? {};
  const days: Days = { ...daysOf(a) };
  for (const [day, words] of Object.entries(daysOf(b))) days[day] = Math.max(days[day] ?? words, words);
  const mine = daysOf(row);
  const same = Object.keys(days).every((day) => mine[day] === days[day]);
  if (same) return winner;
  return { ...winner, row: { ...row, settings: { ...(row.settings as object), wordsByDay: days } } };
}

export function mergeRows(local: ReadonlyMap<string, Version>, remote: readonly Version[]): Plan {
  const plan: Plan = { take: [], keep: [] };
  for (const theirs of remote) {
    const mine = local.get(clockKey(theirs.table, theirs.id));
    const winner = !mine || theirs.at > mine.at ? theirs : mine;
    const next =
      theirs.table === 'projects' && mine?.row && theirs.row
        ? withDays(winner, mine.row, theirs.row)
        : winner;
    if (winner === theirs) plan.take.push(next);
    else if (next !== mine) plan.keep.push(next);
  }
  return plan;
}
