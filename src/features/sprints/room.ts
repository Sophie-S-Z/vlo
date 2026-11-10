import { rpc, ShareError } from '@/features/share/rpc';
import { toBase64Url } from '@/lib/crypto';

/*
 * The sprint room (roadmap F60, plan Task K7, decision K7, migration 0006). Friends sprint together with a
 * six-letter code. Each request holds only the code, a random member id, the nickname and a word count:
 * never a title or a word of text.
 */

export const ROOM_SIZE = 20;
export const NICKNAME_MAX = 24;
/** The time between two posts while a sprint runs. */
export const POLL_MS = 15_000;

export interface Room {
  code: string;
  /** A random id that only this tab knows. It lets this writer post their words, and no one else. */
  member: string;
  nickname: string;
}

export interface Standing {
  nickname: string;
  words: number;
  mine: boolean;
}

const CODE = /^[A-HJ-NP-Z]{6}$/;

/** The code as the server keeps it: capitals, with no space or dash. */
export const cleanCode = (text: string): string => text.toUpperCase().replace(/[^A-Z]/g, '');

/** The nickname with no control character and single spaces. */
export const cleanNickname = (text: string): string =>
  text
    .replace(/\p{Cc}/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();

export const createRoom = (): Promise<string> => rpc<string>('room_create', {}, 'room');

/** Joins the room with a new member id. A wrong code or nickname is a RangeError, and no request goes. */
export async function joinRoom(
  code: string,
  nickname: string,
): Promise<{ room: Room; standings: Standing[] }> {
  const clean = cleanCode(code);
  if (!CODE.test(clean)) throw new RangeError('A room code is six letters.');
  const name = cleanNickname(nickname);
  // Code points, as Postgres counts the characters of the nickname.
  if (name === '' || Array.from(name).length > NICKNAME_MAX)
    throw new RangeError(`Type a nickname of 1 to ${String(NICKNAME_MAX)} characters.`);
  const room = {
    code: clean,
    member: toBase64Url(crypto.getRandomValues(new Uint8Array(16))),
    nickname: name,
  };
  const standings = await rpc<Standing[]>(
    'room_join',
    { p_code: room.code, p_member: room.member, p_nickname: room.nickname },
    'room',
  );
  return { room, standings };
}

/** Posts the words of this writer's sprint, and gives the standings of the room. */
export const postWords = (room: Room, words: number): Promise<Standing[]> =>
  rpc<Standing[]>('room_post', { p_code: room.code, p_member: room.member, p_words: words }, 'room');

/** The words to show for a failed room call. */
export function roomMessage(error: unknown): string {
  if (error instanceof RangeError) return error.message;
  if (!(error instanceof ShareError)) return 'Vlo could not reach the sprint room. Try again.';
  switch (error.kind) {
    case 'unavailable':
      return 'No room has this code now. A room ends 24 hours after someone makes it.';
    case 'limit':
      return `This room is full. A room holds ${String(ROOM_SIZE)} writers.`;
    case 'busy':
      return 'The sprint server is at its limit for now. Try again in an hour.';
    case 'offline':
      return 'Vlo could not reach the sprint server. Check the connection, then try again.';
    default:
      return 'The sprint server refused the request. Try again later.';
  }
}
