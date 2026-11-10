import { clockKey, type SyncTable } from './clock';

/*
 * The merge of synced rows (decision R6, ADR 0008). Pure: no database, no clock. For each row the newer
 * change wins, except that a delete loses to an edit that it never saw. A project row also keeps the larger
 * word count of each day from both devices.
 */

/** A row as one device has it, with the time of its last change. No `row` means that a delete removed it. */
export interface Version {
  table: SyncTable;
  id: string;
  at: number;
  row?: Record<string, unknown>;
  /** For a delete, the time of the change that it removed. */
  seen?: number;
}

export interface Plan {
  /** The other device's versions that win, to write with their own times. */
  take: Version[];
  /** This device's project rows, which win but take more words for a day. They keep their times. */
  keep: Version[];
  /** This device's rows that changed after the change that a newer delete removed. The delete never saw
   * them, so they stay, and this device stamps them again so that they come back on the other devices. */
  revive: Version[];
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
  const plan: Plan = { take: [], keep: [], revive: [] };
  for (const theirs of remote) {
    const mine = local.get(clockKey(theirs.table, theirs.id));
    // An edit that a delete never saw wins, so a delete on one device loses no words from another.
    if (
      mine?.row &&
      !theirs.row &&
      theirs.at > mine.at &&
      theirs.seen !== undefined &&
      mine.at > theirs.seen
    ) {
      plan.revive.push(mine);
      continue;
    }
    const winner = !mine || theirs.at > mine.at ? theirs : mine;
    const next =
      theirs.table === 'projects' && mine?.row && theirs.row
        ? withDays(winner, mine.row, theirs.row)
        : winner;
    if (winner === theirs) plan.take.push(next);
    else if (next !== mine) plan.keep.push(next);
  }
  // A row that stays keeps its project too, so a delete of the whole project does not take it.
  const dropped = plan.take.find((v) => v.table === 'projects' && !v.row);
  const project = dropped && local.get(clockKey('projects', dropped.id));
  if (plan.revive.length > 0 && dropped && project?.row) {
    plan.take = plan.take.filter((v) => v !== dropped);
    plan.revive.push(project);
  }
  return plan;
}
