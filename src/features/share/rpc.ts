import { supabaseUrl, vloFetch } from '@/lib/net';

/*
 * The Supabase calls of share links, usage counts, sync and sprint rooms (spec section 11, plan decision
 * S2). Each call is a PostgREST RPC through the network module, so it goes in the network log. Vlo calls
 * functions only and reads no table. The anon key is public by design: row level security with no policies keeps every
 * table closed, and each function checks its own input.
 */

export type RpcName =
  | 'create_share'
  | 'get_share'
  | 'revoke_share'
  | 'add_comment'
  | 'list_comments'
  // The images of a link (Phase 16, migration 0007).
  | 'add_share_image'
  | 'get_share_image'
  | 'ping'
  | 'submit_usage'
  // Sync between the writer's devices (F49, migration 0005).
  | 'create_sync_space'
  | 'sync_put'
  | 'sync_list'
  | 'sync_devices'
  | 'sync_drop'
  | 'leave_sync'
  | 'delete_sync_space'
  // Sprint rooms (F60, migration 0006).
  | 'room_create'
  | 'room_join'
  | 'room_post'
  // Accounts, the daily count, feedback and the owner page (Phase 18, migration 0008).
  | 'vault_get'
  | 'vault_put'
  | 'vault_delete'
  | 'delete_my_account'
  | 'daily_count'
  | 'send_feedback'
  | 'is_owner'
  | 'owner_summary'
  | 'owner_daily'
  | 'owner_accounts'
  | 'owner_feedback'
  | 'owner_set_feedback';

export type ShareErrorKind =
  'not-set-up' | 'offline' | 'unavailable' | 'too-large' | 'limit' | 'busy' | 'server';

const MESSAGES: Record<ShareErrorKind, string> = {
  'not-set-up': 'Sharing is not set up in this build.',
  offline: 'Vlo could not reach the share server. Check the connection, then try again.',
  unavailable: 'This link expired, or the writer stopped sharing it.',
  'too-large': 'This is too large to share. Pick fewer items, or a shorter comment.',
  limit: 'This link has the most comments that it can take.',
  busy: 'The share server is at its limit for now. Try again in an hour.',
  server: 'The share server refused the request. Try again later.',
};

export class ShareError extends Error {
  /** A message replaces the fixed text of the kind when it can say more, such as a size. */
  constructor(
    readonly kind: ShareErrorKind,
    message?: string,
  ) {
    super(message ?? MESSAGES[kind]);
    this.name = 'ShareError';
  }
}

/** True when this build has a Supabase project and its anon key. */
export function sharingReady(): boolean {
  return supabaseUrl() !== '' && anonKey() !== '';
}

export function anonKey(): string {
  return (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim() ?? '';
}

/** The ShareError kind of a refusal, from the message that the migration raises. */
function kindOf(message: string): ShareErrorKind {
  if (message.includes('too large')) return 'too-large';
  if (message.includes('share unavailable')) return 'unavailable';
  if (message.includes('comment limit reached')) return 'limit';
  if (message.includes('server busy') || message.includes('server full')) return 'busy';
  // Sync (migration 0005): a wrong space or token, and a space at its limits.
  if (message.includes('unknown space')) return 'unavailable';
  if (message.includes('device limit') || message.includes('space full')) return 'limit';
  // Sprint rooms (migration 0006): an old or wrong code, and a full room.
  if (message.includes('unknown room')) return 'unavailable';
  if (message.includes('room full')) return 'limit';
  // Phase 18 (migration 0008): no session, not the owner, and the feedback limit of an install.
  if (message.includes('not signed in') || message.includes('not owner')) return 'unavailable';
  if (message.includes('feedback limit')) return 'limit';
  if (message.includes('message too large')) return 'too-large';
  return 'server';
}

/**
 * Calls one Supabase function with named arguments and gives its JSON answer. `token` is the access token
 * of a signed-in writer (Phase 18), and the function reads the account from it. With none, the call goes
 * as the anon role.
 */
export async function rpc<T>(
  name: RpcName,
  args: Record<string, unknown>,
  purpose: 'share' | 'usage' | 'sync' | 'room' | 'account' | 'ping' | 'feedback',
  token?: string,
): Promise<T> {
  if (!sharingReady()) throw new ShareError('not-set-up');
  const key = anonKey();
  let response: Response;
  try {
    response = await vloFetch(`${supabaseUrl()}/rest/v1/rpc/${name}`, {
      purpose,
      method: 'POST',
      headers: {
        apikey: key,
        // A publishable key (`sb_publishable_…`) is not a JWT, so Supabase refuses it as a bearer token. With
        // one, a call with no account sends the key in `apikey` only, and the gateway adds the anon role.
        ...(token || !key.startsWith('sb_') ? { Authorization: `Bearer ${token ?? key}` } : {}),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(args),
    });
  } catch {
    throw new ShareError('offline');
  }
  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }
  if (!response.ok) {
    const message =
      typeof body === 'object' && body !== null && typeof (body as { message?: unknown }).message === 'string'
        ? (body as { message: string }).message
        : '';
    throw new ShareError(kindOf(message));
  }
  return body as T;
}
