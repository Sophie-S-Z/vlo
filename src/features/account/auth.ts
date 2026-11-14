import { anonKey, rpc, sharingReady } from '@/features/share/rpc';
import { clock } from '@/lib/clock';
import { withLock } from '@/lib/lock';
import { toBase64Url } from '@/lib/crypto';
import { supabaseUrl, vloFetch } from '@/lib/net';
import { forgetSession, readSession, saveSession, type AccountSession } from './session';

/*
 * Accounts (Phase 18, decision A2): Supabase Auth through its REST paths, so Vlo loads no auth package and
 * each request goes through the network module with the purpose `account`. A writer signs in with a
 * 6-digit code from an email, or with Google in a build that sets `VITE_AUTH_GOOGLE`. No password.
 */

export type AuthErrorKind =
  'not-set-up' | 'offline' | 'bad-code' | 'bad-email' | 'too-many' | 'mail' | 'signed-out' | 'server';

const MESSAGES: Record<AuthErrorKind, string> = {
  'not-set-up': 'Accounts are not set up in this build.',
  offline: 'Vlo could not reach the account server. Check the connection, then try again.',
  'bad-code': 'This code is wrong or too old. Ask for a new code.',
  'bad-email': 'The account server did not take this email address. Check it, then try again.',
  'too-many': 'Vlo asked for too many codes. Wait a minute, then try again.',
  mail: 'The account server could not send the email. Try again later.',
  'signed-out': 'You are signed out. Sign in again.',
  server: 'The account server refused the request. Try again later.',
};

export class AuthError extends Error {
  constructor(readonly kind: AuthErrorKind) {
    super(MESSAGES[kind]);
    this.name = 'AuthError';
  }
}

/** True when this build can sign in: it has a Supabase project. */
export const accountsReady = sharingReady;

/** True when this build offers "Continue with Google". */
export function googleReady(): boolean {
  return accountsReady() && (import.meta.env.VITE_AUTH_GOOGLE as string | undefined)?.trim() === '1';
}

/** A plain check of an email address. The server checks it again. */
export function looksLikeEmail(text: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text.trim()) && text.trim().length <= 254;
}

async function auth(path: string, body: unknown, token?: string): Promise<unknown> {
  if (!accountsReady()) throw new AuthError('not-set-up');
  let response: Response;
  try {
    response = await vloFetch(`${supabaseUrl()}/auth/v1/${path}`, {
      purpose: 'account',
      method: 'POST',
      headers: {
        apikey: anonKey(),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
  } catch {
    throw new AuthError('offline');
  }
  let answer: unknown = null;
  try {
    answer = await response.json();
  } catch {
    answer = null;
  }
  if (response.ok) return answer;
  const fields = (answer ?? {}) as { error_code?: unknown; code?: unknown; msg?: unknown; error?: unknown };
  const code = [fields.error_code, fields.code, fields.error, fields.msg]
    .filter((v) => typeof v === 'string')
    .join(' ');
  throw new AuthError(refusal(path, response.status, code));
}

/**
 * What a refused request of an /auth/v1 path means. Only a refusal of the request itself (a 4xx) can
 * sign the device out or call a code wrong. A fault of the server (a 5xx) never does.
 */
export function refusal(path: string, status: number, code: string): AuthErrorKind {
  if (status === 429 || /rate.?limit/i.test(code)) return 'too-many';
  if (path === 'otp') {
    // The server answers a failed email with a 5xx, or with a refusal of the address for its mail.
    if (status >= 500 || /smtp|not_authorized|sending/i.test(code)) return 'mail';
    return /email|invalid/i.test(code) ? 'bad-email' : 'server';
  }
  if (status >= 500) return 'server';
  if (status >= 400) return path.startsWith('token') && !path.includes('pkce') ? 'signed-out' : 'bad-code';
  return 'server';
}

interface TokenAnswer {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  user: { id: string; email?: string; app_metadata?: { provider?: string } };
}

function isTokenAnswer(value: unknown): value is TokenAnswer {
  const v = value as Partial<TokenAnswer> | null;
  return (
    typeof v?.access_token === 'string' &&
    typeof v.refresh_token === 'string' &&
    typeof v.expires_in === 'number' &&
    typeof v.user?.id === 'string'
  );
}

async function keep(answer: unknown): Promise<AccountSession> {
  if (!isTokenAnswer(answer)) throw new AuthError('server');
  const session: AccountSession = {
    accessToken: answer.access_token,
    refreshToken: answer.refresh_token,
    expiresAt: clock.now() + answer.expires_in * 1000,
    userId: answer.user.id,
    email: answer.user.email ?? '',
    provider: answer.user.app_metadata?.provider ?? 'email',
  };
  await saveSession(session);
  return session;
}

/** Sends a 6-digit sign-in code to the address. A new address gets a new account. */
export async function sendCode(email: string): Promise<void> {
  await auth('otp', { email: email.trim(), create_user: true });
}

/** Checks the code of the email, and keeps the session on this device. */
export async function verifyCode(email: string, code: string): Promise<AccountSession> {
  return keep(await auth('verify', { type: 'email', email: email.trim(), token: code.replace(/\s/g, '') }));
}

const PKCE = 'vlo:pkce';

/** The address of Google's sign-in, through Supabase, with a PKCE challenge. The answer comes to /account. */
export async function googleSignInUrl(origin = window.location.origin): Promise<string> {
  if (!googleReady()) throw new AuthError('not-set-up');
  const verifier = toBase64Url(crypto.getRandomValues(new Uint8Array(32)));
  const challenge = toBase64Url(
    new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))),
  );
  sessionStorage.setItem(PKCE, verifier);
  const query = new URLSearchParams({
    provider: 'google',
    redirect_to: `${origin}/account`,
    code_challenge: challenge,
    code_challenge_method: 's256',
  });
  return `${supabaseUrl()}/auth/v1/authorize?${query.toString()}`;
}

/** Finishes a Google sign-in with the code that came back in the address. */
export async function finishGoogle(code: string): Promise<AccountSession> {
  const verifier = sessionStorage.getItem(PKCE);
  sessionStorage.removeItem(PKCE);
  if (!verifier) throw new AuthError('bad-code');
  return keep(await auth('token?grant_type=pkce', { auth_code: code, code_verifier: verifier }));
}

/** A refresh runs once at a time on this device, so two tabs never spend one refresh token twice. */
function withAccountLock<T>(fn: () => Promise<T>): Promise<T> {
  return withLock('vlo-account', fn);
}

/**
 * The session with an access token that works for at least a minute more, or null when no one is signed
 * in. A refused refresh signs the device out. With no connection it throws AuthError('offline').
 */
export function currentSession(): Promise<AccountSession | null> {
  return withAccountLock(async () => {
    const session = await readSession();
    if (!session) return null;
    if (session.expiresAt - 60_000 > clock.now()) return session;
    try {
      return await keep(
        await auth('token?grant_type=refresh_token', { refresh_token: session.refreshToken }),
      );
    } catch (error) {
      if (error instanceof AuthError && (error.kind === 'signed-out' || error.kind === 'bad-code')) {
        await forgetSession();
        return null;
      }
      throw error;
    }
  });
}

/** Calls a function of migration 0008 as the signed-in writer. */
export async function accountRpc<T>(name: Parameters<typeof rpc>[0], args: Record<string, unknown> = {}) {
  const session = await currentSession();
  if (!session) throw new AuthError('signed-out');
  return rpc<T>(name, args, 'account', session.accessToken);
}

/** Signs this device out. The server ends this session. A device with no connection still signs out. */
export async function signOut(): Promise<void> {
  const session = await readSession();
  await forgetSession();
  if (session) await auth('logout?scope=local', {}, session.accessToken).catch(() => undefined);
}

/** Deletes the account on the server (decision A7), then signs this device out. */
export async function deleteAccount(): Promise<void> {
  await accountRpc('delete_my_account');
  await forgetSession();
}
