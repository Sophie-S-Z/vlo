import { vloFetch } from '@/lib/net';

/*
 * A draft on WordPress.com (Phase 17 decision P1). WordPress.com has a free API that a browser can call. A
 * build that has a WordPress.com app id (VITE_WPCOM_CLIENT_ID) shows "Save as a draft on WordPress.com".
 * The writer signs in to WordPress.com in a new window and picks one site (OAuth 2, implicit flow). The
 * window comes back to wpcom-callback.html, which sends the token to this tab on a BroadcastChannel: the
 * Cross-Origin-Opener-Policy of Vlo cuts the link to a window that visited another site. The token stays
 * in this tab's memory and goes only to public-api.wordpress.com. Vlo saves the post as a draft, never
 * publishes it.
 */

export const WPCOM_HOST = 'public-api.wordpress.com';
export const WPCOM_CHANNEL = 'vlo-wpcom';

export interface WpcomToken {
  token: string;
  siteId: string;
  /** When the token stops working, in milliseconds. */
  expiresAt: number;
}

export interface WpcomDraft {
  /** The page in WordPress.com where the writer edits the draft. */
  editUrl: string;
}

/** The WordPress.com app id of this build, or '' when the build has none. */
export function wpcomClientId(): string {
  const value = (import.meta.env.VITE_WPCOM_CLIENT_ID as string | undefined)?.trim() ?? '';
  return /^\d+$/.test(value) ? value : '';
}

/** The page that WordPress.com sends the writer back to. The app registers this address. */
export function wpcomRedirect(): string {
  return new URL(`${import.meta.env.BASE_URL}wpcom-callback.html`, globalThis.location.origin).href;
}

export function authorizeUrl(clientId: string, state: string): string {
  const url = new URL(`https://${WPCOM_HOST}/oauth2/authorize`);
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('redirect_uri', wpcomRedirect());
  url.searchParams.set('response_type', 'token');
  url.searchParams.set('state', state);
  return url.href;
}

/** Reads the token from the fragment that WordPress.com adds to the callback address. */
export function readFragment(fragment: string, state: string, now: number): WpcomToken | null {
  const params = new URLSearchParams(fragment.replace(/^#/, ''));
  const token = params.get('access_token') ?? '';
  const siteId = params.get('site_id') ?? '';
  if (params.get('state') !== state || token === '' || !/^\d+$/.test(siteId)) return null;
  const seconds = Number(params.get('expires_in') ?? '0');
  return {
    token,
    siteId,
    expiresAt: now + (Number.isFinite(seconds) && seconds > 0 ? seconds : 3600) * 1000,
  };
}

let held: WpcomToken | null = null;
let stopWaiting: (() => void) | null = null;

/** The token of this tab, while it works. */
export function heldToken(now = Date.now()): WpcomToken | null {
  return held && held.expiresAt > now + 60_000 ? held : null;
}

export function forgetToken(): void {
  held = null;
}

/**
 * Opens the WordPress.com sign-in window and waits for its token. It must run in the writer's click, or
 * the browser blocks the window.
 */
export function connectWpcom(clientId: string): Promise<WpcomToken> {
  // The site's opener policy cuts the link to the window, so Vlo cannot see the writer close it. A new
  // sign-in replaces the one that waits.
  stopWaiting?.();
  const state = crypto.randomUUID();
  const popup = window.open(authorizeUrl(clientId, state), 'vlo-wpcom', 'popup,width=600,height=760');
  if (!popup)
    return Promise.reject(
      new Error('The browser blocked the sign-in window. Allow pop-ups for Vlo, then try again.'),
    );
  return new Promise((resolve, reject) => {
    const channel = new BroadcastChannel(WPCOM_CHANNEL);
    const stop = (error?: Error, token?: WpcomToken) => {
      channel.close();
      window.clearTimeout(timer);
      stopWaiting = null;
      if (token) resolve(token);
      else reject(error ?? new Error('WordPress.com did not answer.'));
    };
    // Ten minutes is enough to sign in. After that, the writer starts again.
    const timer = window.setTimeout(() => {
      stop(new Error('The sign-in took too long. Try again.'));
    }, 600_000);
    stopWaiting = () => {
      stop(new Error('A new sign-in started.'));
    };
    channel.onmessage = (event: MessageEvent<unknown>) => {
      if (typeof event.data !== 'string') return;
      const params = new URLSearchParams(event.data.replace(/^#/, ''));
      if (params.get('state') !== state) return;
      if (params.get('error')) {
        stop(new Error('WordPress.com did not give access. You can try again.'));
        return;
      }
      const token = readFragment(event.data, state, Date.now());
      if (!token) {
        stop(new Error('WordPress.com sent an answer that Vlo cannot read.'));
        return;
      }
      held = token;
      stop(undefined, token);
    };
  });
}

/** Saves the post as a draft on the writer's WordPress.com site. */
export async function saveWpcomDraft(
  token: WpcomToken,
  post: { title: string; html: string; excerpt: string },
): Promise<WpcomDraft> {
  const response = await vloFetch(`https://${WPCOM_HOST}/rest/v1.1/sites/${token.siteId}/posts/new`, {
    purpose: 'publish',
    method: 'POST',
    headers: { Authorization: `Bearer ${token.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title: post.title,
      content: post.html,
      excerpt: post.excerpt,
      status: 'draft',
    }),
  });
  if (response.status === 401 || response.status === 403) {
    forgetToken();
    throw new Error('WordPress.com asked for a new sign-in. Choose Save as a draft again.');
  }
  if (!response.ok)
    throw new Error(`WordPress.com did not save the draft (HTTP ${String(response.status)}).`);
  const saved = (await response.json()) as { ID?: unknown; site_ID?: unknown };
  const id = typeof saved.ID === 'number' ? saved.ID : null;
  const site = typeof saved.site_ID === 'number' ? saved.site_ID : Number(token.siteId);
  if (id === null) throw new Error('WordPress.com saved no post.');
  return { editUrl: `https://wordpress.com/post/${String(site)}/${String(id)}` };
}
