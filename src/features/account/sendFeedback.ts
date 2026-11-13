import { rpc } from '@/features/share/rpc';
import { APP_VERSION } from '@/features/usage/usage';
import { currentSession } from './auth';
import { deviceKind, installId } from './dailyCountState';

/*
 * Feedback to the owner of Vlo (Phase 18, decision A5). The message goes only when the writer presses
 * Send, with the kind of device and the app version. A signed-in writer's account goes with it, so the
 * owner can see who wrote. A reply address goes only when the writer types one.
 */

export const FEEDBACK_KINDS = [
  { value: 'idea', label: 'An idea or a suggestion' },
  { value: 'problem', label: 'A problem' },
  { value: 'praise', label: 'Something that I like' },
  { value: 'question', label: 'A question' },
] as const;
export type FeedbackKind = (typeof FEEDBACK_KINDS)[number]['value'];

export const MAX_FEEDBACK = 4000;

export interface FeedbackDraft {
  kind: FeedbackKind;
  message: string;
  /** 1 to 5, or null for no rating. */
  rating: number | null;
  contact: string;
  /** The screen that the writer came from, such as "settings", or ''. */
  place: string;
}

/** A screen name for the server: lower-case letters, digits and hyphens, at most 40. */
export function placeOf(path: string): string {
  const first = path.split('/').find(Boolean) ?? 'library';
  const name = first === 'p' ? 'project' : first;
  return name
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '')
    .slice(0, 40);
}

export async function sendFeedback(draft: FeedbackDraft): Promise<void> {
  const session = await currentSession().catch(() => null);
  await rpc(
    'send_feedback',
    {
      p_install: installId(),
      p_kind: draft.kind,
      p_message: draft.message.trim(),
      p_rating: draft.rating,
      p_contact: draft.contact.trim(),
      p_version: APP_VERSION,
      p_device: deviceKind(),
      p_place: draft.place,
    },
    'feedback',
    session?.accessToken,
  );
}
