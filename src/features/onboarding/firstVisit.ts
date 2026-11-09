import { clock } from '@/lib/clock';
import { db } from '@/lib/db';
import { startWithSimpleTools } from '@/features/editor/writingPrefs';

const ONBOARDED = 'onboardedAt';

/** True on a first visit: no projects and no finished or skipped welcome. */
export async function needsOnboarding(): Promise<boolean> {
  const [projects, onboarded] = await Promise.all([db.projects.count(), db.appMeta.get(ONBOARDED)]);
  return projects === 0 && onboarded === undefined;
}

/** Ends the welcome. Only a new writer sees it, so the toolbar starts at Simple (decision P4). */
export async function markOnboarded(): Promise<void> {
  startWithSimpleTools();
  await db.appMeta.put({ key: ONBOARDED, value: clock.now() });
}
