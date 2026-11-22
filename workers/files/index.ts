/*
 * The file store of sync (scaling fix 5, ADR 0014), a Cloudflare Worker in front of an R2 bucket. It holds
 * the sealed images, research files and saved versions of sync, and Supabase keeps a short row for each
 * (migration 0018). Like the relay, it sees only cipher text and HMAC keys.
 *
 * PUT /v1/<space>/<device>/<key> stores a file under a new id, then registers it with sync_put_file. A
 * refused put deletes the new file again. GET /v1/<space>/<id> gives a file to a device of its space. Each
 * call sends the space token as a bearer token. Each hour, the sweep deletes the files that no row has used
 * for a day. A file never changes, so a device that reads an older row still gets the blob of that row.
 */

/** The parts of the R2 binding that this Worker uses. */
interface Bucket {
  put(key: string, value: ArrayBuffer | string): Promise<unknown>;
  get(key: string): Promise<{ body: ReadableStream; size: number } | null>;
  delete(keys: string | string[]): Promise<void>;
  list(options: { limit: number; startAfter?: string }): Promise<{
    objects: { key: string; size: number; uploaded: Date }[];
    truncated: boolean;
  }>;
}

export interface Env {
  FILES: Bucket;
  /** The Supabase project and its publishable key, the public values of the app's .env. */
  SUPABASE_URL: string;
  SUPABASE_KEY: string;
}

/** The largest file: a sealed blob of 2 MB of data, with room for the JSON around it. */
export const MAX_FILE = 3_000_000;
/** A file that no row used for this long goes. A device that read a row a moment before it changed still gets its file. */
export const GRACE = 24 * 60 * 60 * 1000;
/** The files that one sweep reads, in pages of 1,000. The free plan allows 50 calls for each run. */
const SWEEP_PAGES = 5;
/** The R2 object that holds the key where the next sweep starts. */
export const SWEEP_MARK = 'sweep-mark';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** The app calls from its own origin, and sends no cookie, so any origin may call. */
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, PUT',
  'Access-Control-Allow-Headers': 'Authorization, X-Vlo-Iv',
  'Access-Control-Max-Age': '86400',
};

const answer = (status: number, body: unknown) => Response.json(body, { status, headers: CORS });
const refuse = (status: number, message: string) => answer(status, { message });

type Rpc = { ok: true; value: unknown } | { ok: false; message: string };

/** Calls one Supabase function as the anon role, as the app does. */
async function rpc(env: Env, name: string, args: Record<string, unknown>): Promise<Rpc> {
  const response = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: { apikey: env.SUPABASE_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
  });
  const body = (await response.json().catch(() => null)) as unknown;
  if (response.ok) return { ok: true, value: body };
  const message = (body as { message?: unknown } | null)?.message;
  return { ok: false, message: typeof message === 'string' ? message : 'server' };
}

async function put(request: Request, env: Env, space: string, device: string, key: string, token: string) {
  if (Number(request.headers.get('Content-Length') ?? 0) > MAX_FILE) return refuse(413, 'blob too large');
  const body = await request.arrayBuffer();
  if (body.byteLength === 0) return refuse(400, 'bad payload');
  if (body.byteLength > MAX_FILE) return refuse(413, 'blob too large');
  const id = crypto.randomUUID();
  const name = `${space}/${id}`;
  await env.FILES.put(name, body);
  let done: Rpc;
  try {
    done = await rpc(env, 'sync_put_file', {
      p_space: space,
      p_token: token,
      p_device: device,
      p_key: key,
      p_iv: request.headers.get('X-Vlo-Iv') ?? '',
      p_file: id,
      p_size: body.byteLength,
    });
  } catch {
    done = { ok: false, message: 'server' };
  }
  if (done.ok) return answer(200, { at: done.value });
  await env.FILES.delete(name);
  return refuse(done.message === 'server' ? 502 : 400, done.message);
}

async function get(env: Env, space: string, id: string, token: string) {
  const check = await rpc(env, 'sync_check', { p_space: space, p_token: token });
  if (!check.ok) return refuse(502, check.message);
  if (check.value !== true) return refuse(403, 'unknown space');
  const file = await env.FILES.get(`${space}/${id}`);
  if (!file) return refuse(404, 'no file');
  return new Response(file.body, {
    headers: {
      ...CORS,
      'Content-Type': 'application/octet-stream',
      'Content-Length': String(file.size),
      'Cache-Control': 'private, no-store',
    },
  });
}

export async function handle(request: Request, env: Env): Promise<Response> {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  const parts = new URL(request.url).pathname.split('/').slice(1);
  const token = /^Bearer (\S+)$/.exec(request.headers.get('Authorization') ?? '')?.[1] ?? '';
  const [version, space = '', a = '', b] = parts;
  if (version !== 'v1' || !UUID.test(space)) return refuse(404, 'not found');
  try {
    if (request.method === 'PUT' && parts.length === 4 && b)
      return await put(request, env, space, a, b, token);
    if (request.method === 'GET' && parts.length === 3 && UUID.test(a))
      return await get(env, space, a, token);
  } catch {
    return refuse(502, 'server');
  }
  return refuse(404, 'not found');
}

/** The space and id of a file, or null for an object that is no file of sync. */
function fileOf(key: string): { space: string; id: string } | null {
  const [space = '', id = '', ...rest] = key.split('/');
  return rest.length === 0 && UUID.test(space) && UUID.test(id) ? { space, id } : null;
}

/**
 * Deletes the files older than a day that no row uses. Each run reads a few pages from where the last run
 * stopped, and starts at the first file again after the last one.
 */
export async function sweep(env: Env, now: number): Promise<void> {
  const mark = await env.FILES.get(SWEEP_MARK);
  let after = mark ? await new Response(mark.body).text() : '';
  for (let page = 0; page < SWEEP_PAGES; page++) {
    const list = await env.FILES.list({ limit: 1000, ...(after ? { startAfter: after } : {}) });
    const old = list.objects.filter((o) => o.key !== SWEEP_MARK && now - o.uploaded.getTime() > GRACE);
    const files = old.flatMap((o) => {
      const file = fileOf(o.key);
      return file ? [{ ...file, size: o.size }] : [];
    });
    const known = new Set<string>();
    if (files.length > 0) {
      const found = await rpc(env, 'sync_files_known', { p_files: files });
      if (!found.ok) throw new Error(`sync_files_known: ${found.message}`);
      for (const f of found.value as { space: string; id: string }[]) known.add(`${f.space}/${f.id}`);
    }
    const gone = old.filter((o) => !known.has(o.key)).map((o) => o.key);
    if (gone.length > 0) await env.FILES.delete(gone);
    after = list.truncated ? (list.objects.at(-1)?.key ?? '') : '';
    if (after === '') break;
  }
  await env.FILES.put(SWEEP_MARK, after);
}

export default {
  fetch: handle,
  async scheduled(event: { scheduledTime: number }, env: Env): Promise<void> {
    await sweep(env, event.scheduledTime);
  },
};
