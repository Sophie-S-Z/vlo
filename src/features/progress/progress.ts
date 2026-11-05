import { useLiveQuery } from 'dexie-react-hooks';
import { clock } from '@/lib/clock';
import { db, type Project } from '@/lib/db';

/* The Progress data (spec 8.4, plan Task C9, F21): the session count and the goal settings. */

export const DEFAULT_GOAL = 500;
export const MAX_GOAL = 100_000;

/** The project's writing sessions from the session timer. Undefined while loading. */
export function useSessionCount(projectId: string): number | undefined {
  return useLiveQuery(() => db.sessions.where('projectId').equals(projectId).count(), [projectId]);
}

export interface GoalSettings {
  streaksEnabled: boolean;
  goalWordsPerDay: number;
  restDays: readonly number[];
}

/** The goal settings of a project, with the default goal when the writer has set none. */
export function goalsOf(settings: Project['settings']): GoalSettings {
  return {
    streaksEnabled: settings.streaksEnabled,
    goalWordsPerDay: settings.goalWordsPerDay ?? DEFAULT_GOAL,
    restDays: settings.restDays,
  };
}

/**
 * Saves a change to the goal settings. A goal outside 1 to 100,000 words is a RangeError.
 * `toggleRestDay` turns one weekday on or off inside the write, so quick taps on several days never drop
 * one of them.
 */
export async function setGoals(
  projectId: string,
  change: Partial<GoalSettings> & { toggleRestDay?: number },
): Promise<void> {
  const goal = change.goalWordsPerDay;
  if (goal !== undefined && (!Number.isInteger(goal) || goal < 1 || goal > MAX_GOAL))
    throw new RangeError(`Type a goal from 1 to ${MAX_GOAL.toLocaleString()} words.`);
  const restDays =
    change.restDays === undefined
      ? undefined
      : [...new Set(change.restDays)]
          .filter((d) => Number.isInteger(d) && d >= 0 && d <= 6)
          .sort((a, b) => a - b);
  await db.projects
    .where('id')
    .equals(projectId)
    .modify((project) => {
      project.settings = {
        ...project.settings,
        ...(change.streaksEnabled === undefined ? {} : { streaksEnabled: change.streaksEnabled }),
        // Turning the goal on keeps the goal of last time, or starts at the default.
        ...(goal !== undefined
          ? { goalWordsPerDay: goal }
          : change.streaksEnabled === true && project.settings.goalWordsPerDay === undefined
            ? { goalWordsPerDay: DEFAULT_GOAL }
            : {}),
        ...(restDays === undefined ? {} : { restDays }),
      };
      const day = change.toggleRestDay;
      if (day !== undefined && Number.isInteger(day) && day >= 0 && day <= 6) {
        const now = project.settings.restDays;
        project.settings.restDays = (now.includes(day) ? now.filter((d) => d !== day) : [...now, day]).sort(
          (a, b) => a - b,
        );
      }
      project.updatedAt = clock.now();
    });
}
