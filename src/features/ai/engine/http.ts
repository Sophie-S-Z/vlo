import { vloFetch } from '@/lib/net';
import { EngineError, isAbort } from './types';
import { localHelp, type Preset } from './presets';

/*
 * The request and error rules that every provider adapter shares (plan Task D3): one request through the
 * network module, a plain message for each failure, and no retry on a limit.
 */

/** The provider's own words in an error answer, when it sends any. */
async function providerMessage(response: Response): Promise<string> {
  try {
    const text = await response.text();
    try {
      const parsed = JSON.parse(text) as unknown;
      const found = findMessage(parsed);
      if (found) return found;
    } catch {
      // Not JSON: use the text itself.
    }
    return text.trim().slice(0, 300);
  } catch {
    return '';
  }
}

function findMessage(value: unknown): string | null {
  if (typeof value !== 'object' || value === null) return null;
  const record = value as Record<string, unknown>;
  if (typeof record.message === 'string') return record.message;
  if (Array.isArray(value)) return findMessage(value[0]);
  return findMessage(record.error);
}

/** The error for an answer that is not a success. */
export async function errorFor(preset: Preset, response: Response): Promise<EngineError> {
  const said = await providerMessage(response);
  const words = said ? ` ${preset.label} says: "${said}"` : '';
  if (response.status === 401 || response.status === 403)
    return new EngineError('key', `${preset.label} did not accept the key.${words}`);
  if (response.status === 429)
    return new EngineError(
      'limit',
      `${preset.label} says you reached its limit. Wait, then ask again.${words}`,
    );
  if (response.status === 529 || response.status === 503)
    return new EngineError('limit', `${preset.label} is busy. Wait, then ask again.${words}`);
  return new EngineError('server', `${preset.label} answered with HTTP ${String(response.status)}.${words}`);
}

/** Sends one AI request through the network module, with a plain error when the browser cannot reach it. */
export async function send(
  preset: Preset,
  path: string,
  init: { method?: 'GET' | 'POST'; headers: Record<string, string>; body?: string; signal?: AbortSignal },
): Promise<Response> {
  let response: Response;
  try {
    response = await vloFetch(`${preset.base}${path}`, {
      purpose: 'ai',
      ...(init.method ? { method: init.method } : {}),
      headers: init.headers,
      ...(init.body === undefined ? {} : { body: init.body }),
      ...(init.signal ? { signal: init.signal } : {}),
    });
  } catch (problem) {
    if (isAbort(problem) || problem instanceof RangeError) throw problem;
    if (preset.local)
      throw new EngineError(
        'offline',
        `${preset.label} on this computer did not answer. ${localHelp(preset, globalThis.location.origin)}`,
      );
    throw new EngineError(
      'blocked',
      `Vlo could not reach ${preset.label} from this browser. The device may be offline, or ${preset.label} may block requests from a browser. Vlo has no server in between, so try another provider.`,
    );
  }
  if (!response.ok) throw await errorFor(preset, response);
  return response;
}
