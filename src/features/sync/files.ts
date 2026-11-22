import { kindOf, ShareError } from '@/features/share/rpc';
import { fromBase64, toBase64, type Sealed } from '@/lib/crypto';
import { filesUrl, vloFetch } from '@/lib/net';
import type { SyncSpace } from './space';

/*
 * The file store of sync (scaling fix 5, ADR 0014): a Cloudflare Worker in front of R2 (workers/files). It
 * holds the sealed blobs of research files, images and saved versions, so they use no database space. The
 * relay keeps a row for each, whose payload is the id of the file in the store. A build with no store
 * keeps every blob on the relay.
 */

/** True when this build has a file store. */
export const filesReady = (): boolean => filesUrl() !== '';

/** True for the blobs that go to the file store: a research file, an image or a saved version. */
export const inFileStore = (name: string): boolean => /^(file|image|version):/.test(name);

/** The payload of a relay row whose blob is in the file store is a UUID. Base64 never has a "-". */
export const storedFile = (payload: string): boolean =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(payload);

const request = async (
  path: string,
  init: { method?: 'PUT'; headers: Record<string, string>; body?: BodyInit },
) => {
  try {
    return await vloFetch(`${filesUrl()}/v1/${path}`, { purpose: 'sync', ...init });
  } catch {
    throw new ShareError('offline');
  }
};

async function refusal(response: Response): Promise<ShareError> {
  const body = (await response.json().catch(() => null)) as { message?: unknown } | null;
  const message = typeof body?.message === 'string' ? body.message : '';
  return new ShareError(kindOf(message), undefined, message);
}

/** Stores a sealed blob of this device as the file of `key`. Refusals are ShareErrors, as on the relay. */
export async function putFile(space: SyncSpace, key: string, sealed: Sealed): Promise<void> {
  const response = await request(`${space.spaceId}/${space.deviceId}/${key}`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${space.token}`, 'X-Vlo-Iv': sealed.iv },
    body: fromBase64(sealed.payload),
  });
  if (!response.ok) throw await refusal(response);
}

/** The sealed payload of a file, or null when the store has no such file, as after a later change. */
export async function getFile(space: SyncSpace, id: string): Promise<string | null> {
  const response = await request(`${space.spaceId}/${id}`, {
    headers: { Authorization: `Bearer ${space.token}` },
  });
  if (response.status === 404) return null;
  if (!response.ok) throw await refusal(response);
  return toBase64(new Uint8Array(await response.arrayBuffer()));
}
