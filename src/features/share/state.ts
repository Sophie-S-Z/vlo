import { clock } from '@/lib/clock';
import type { ShareRecord } from '@/lib/db';

/* The state of a share link. It is a small module, so the Library can warn about active links. */

export type ShareState = 'active' | 'expired' | 'revoked';

export function shareState(
  record: Pick<ShareRecord, 'revoked' | 'expiresAt'>,
  now = clock.now(),
): ShareState {
  if (record.revoked) return 'revoked';
  return now >= record.expiresAt ? 'expired' : 'active';
}
