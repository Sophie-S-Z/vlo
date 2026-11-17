import { accountRpc } from './auth';

/*
 * The writing leaderboard (ADR 0012, migration 0012). Each signed-in writer sees the writers who added the
 * most words in a period. The words come from the daily count, so the board holds numbers and names only,
 * never a word of writing.
 */

export type Period = 'day' | 'week' | 'month' | 'year';

export interface LeaderboardRow {
  /** 1 for the first. Writers with the same words share a place. */
  place: number;
  /** The pen name, or else the name of the greeting. */
  name: string;
  /** Only the first 10 and the signed-in writer have one. */
  photo: string | null;
  words: number;
  /** The signed-in writer. */
  me: boolean;
}

/** The board of a period, with `today` the local day of this device, as the daily count sends it. */
export const leaderboard = (period: Period, today: string) =>
  accountRpc<LeaderboardRow[]>('leaderboard', { p_period: period, p_today: today });

/** Puts the writer on the board or takes it off. With no argument, it only reads the choice. */
export const showOnLeaderboard = (on?: boolean) =>
  accountRpc<boolean>('leaderboard_show', on === undefined ? {} : { p_on: on });
