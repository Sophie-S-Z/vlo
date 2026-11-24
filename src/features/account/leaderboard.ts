import { accountRpc } from './auth';

/*
 * The writing leaderboard (ADR 0012, migration 0013). Each signed-in writer sees the writers who added the
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

/** A row as the server gives it (migration 0020): no photo when the call named its id as one it has. */
type BoardRow = LeaderboardRow & { photo_id?: string | null };

/** The photos of the last board, by id, so a load each minute does not bring them again. */
let photos = new Map<string, string>();

/** The board of a period, with `today` the local day of this device, as the daily count sends it. */
export async function leaderboard(period: Period, today: string): Promise<LeaderboardRow[]> {
  const rows = await accountRpc<BoardRow[]>('leaderboard', {
    p_period: period,
    p_today: today,
    // A server from before migration 0020 gives no ids, so this list stays empty and it never sees it.
    ...(photos.size > 0 ? { p_have: [...photos.keys()] } : {}),
  });
  const next = new Map<string, string>();
  const board = rows.map(({ photo_id: id, ...row }) => {
    const photo = row.photo ?? (id ? (photos.get(id) ?? null) : null);
    if (id && photo) next.set(id, photo);
    return { ...row, photo };
  });
  photos = next;
  return board;
}

/** Puts the writer on the board or takes it off. With no argument, it only reads the choice. */
export const showOnLeaderboard = (on?: boolean) =>
  accountRpc<boolean>('leaderboard_show', on === undefined ? {} : { p_on: on });
