import { clock } from './clock';
import type { NetPurpose, NetworkLogEntry } from './db';
import { newId } from './ids';

/*
 * The network module (VLO_SPEC section 10, F25): the only code that may call fetch. `appFile` reads files
 * that the app itself serves, such as the fonts that a PDF export embeds. That request stays on the app's
 * own origin, so it is not an outgoing request (US09). `vloFetch` makes every request that leaves the
 * app. It refuses a host that its purpose does not list, and it writes one network log entry for each
 * request.
 */

/** Reads a file under public/, such as "fonts/lora/regular.ttf", from the app's own origin. */
export async function appFile(path: string): Promise<Uint8Array> {
  const origin = globalThis.location.origin;
  const url = new URL(`${import.meta.env.BASE_URL}${path}`, origin);
  if (url.origin !== origin) throw new Error(`${path} is not a file of this app.`);
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Vlo could not load ${path} (HTTP ${String(response.status)}).`);
  return new Uint8Array(await response.arrayBuffer());
}

/**
 * The hosts that each purpose may reach, with the port when it is not the default. A leading "*." allows
 * each subdomain. The CSP `connect-src` in vercel.json lists the same hosts. Sharing and usage counts
 * arrive in Phase 5, so their lists are empty and every request for them is refused.
 */
export const HOSTS: Readonly<Record<NetPurpose, readonly string[]>> = {
  ai: [
    'openrouter.ai',
    'api.groq.com',
    'generativelanguage.googleapis.com',
    'api.anthropic.com',
    'localhost:11434',
    'localhost:1234',
  ],
  'model-download': ['huggingface.co', '*.huggingface.co', '*.hf.co', 'raw.githubusercontent.com'],
  share: [],
  usage: [],
};

/** The most entries the log keeps. The oldest go first. */
export const LOG_LIMIT = 1000;

/** True when `purpose` may reach the host of `url`. Only https, or http for a server on this device. */
export function hostAllowed(url: URL, purpose: NetPurpose): boolean {
  const local = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && local)) return false;
  return HOSTS[purpose].some((host) =>
    host.startsWith('*.') ? url.host.endsWith(host.slice(1)) : url.host === host,
  );
}

/** The bytes of a request body, for the log. */
function sizeOf(body: BodyInit | null | undefined): number {
  if (body === undefined || body === null) return 0;
  if (typeof body === 'string') return new TextEncoder().encode(body).byteLength;
  if (body instanceof Blob) return body.size;
  if (body instanceof ArrayBuffer) return body.byteLength;
  if (ArrayBuffer.isView(body)) return body.byteLength;
  if (body instanceof URLSearchParams) return new TextEncoder().encode(body.toString()).byteLength;
  return 0;
}

/** Writes one log entry. A full or broken log never stops the request. */
async function log(entry: NetworkLogEntry): Promise<void> {
  try {
    // Loaded here, so a worker that only reads app files never loads the database code.
    const { db } = await import('./db');
    await db.transaction('rw', db.networkLog, async () => {
      await db.networkLog.add(entry);
      const extra = (await db.networkLog.count()) - LOG_LIMIT;
      if (extra > 0) await db.networkLog.orderBy('at').limit(extra).delete();
    });
  } catch {
    // The log is a record for the writer. A storage failure must not change what the request does.
  }
}

/** Adds a log entry for a request that another library made, such as a model download in WebLLM. */
export async function logRequest(
  url: string,
  purpose: NetPurpose,
  status: number | 'error',
  bytesSent = 0,
): Promise<void> {
  const parsed = new URL(url);
  await log({
    id: newId(),
    at: clock.now(),
    host: parsed.host,
    path: parsed.pathname,
    purpose,
    bytesSent,
    status,
  });
}

export interface VloRequest {
  purpose: NetPurpose;
  method?: 'GET' | 'POST';
  headers?: Record<string, string>;
  body?: BodyInit;
  signal?: AbortSignal;
}

/**
 * Makes one request that leaves the app. A host that the purpose does not list is a RangeError, and no
 * request starts. The log gets the host, the path, the purpose, the bytes sent and the status, never the
 * query, a key, a header or the body.
 */
export async function vloFetch(url: string, request: VloRequest): Promise<Response> {
  const target = new URL(url);
  if (!hostAllowed(target, request.purpose))
    throw new RangeError(`Vlo does not send ${request.purpose} requests to ${target.host}.`);
  const entry = (status: number | 'error'): NetworkLogEntry => ({
    id: newId(),
    at: clock.now(),
    host: target.host,
    path: target.pathname,
    purpose: request.purpose,
    bytesSent: sizeOf(request.body),
    status,
  });
  try {
    const response = await fetch(target, {
      method: request.method ?? (request.body === undefined ? 'GET' : 'POST'),
      ...(request.headers ? { headers: request.headers } : {}),
      ...(request.body === undefined ? {} : { body: request.body }),
      ...(request.signal ? { signal: request.signal } : {}),
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
    });
    await log(entry(response.status));
    return response;
  } catch (problem) {
    await log(entry('error'));
    throw problem;
  }
}
