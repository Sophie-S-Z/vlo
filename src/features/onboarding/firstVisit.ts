import { clock } from '@/lib/clock';
import { db } from '@/lib/db';

const ONBOARDED = 'onboardedAt';

/** True on a first visit: no projects and no finished or skipped welcome. */
export async function needsOnboarding(): Promise<boolean> {
  const [projects, onboarded] = await Promise.all([db.projects.count(), db.appMeta.get(ONBOARDED)]);
  return projects === 0 && onboarded === undefined;
}

export async function markOnboarded(): Promise<void> {
  await db.appMeta.put({ key: ONBOARDED, value: clock.now() });
}
