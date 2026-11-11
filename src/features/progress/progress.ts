import { useLiveQuery } from 'dexie-react-hooks';
import { clock } from '@/lib/clock';
import { db, type Challenge, type Deadline, type Project } from '@/lib/db';
import { dayKey, deadlineGoal, goalRecord, isCut, wordsOn } from './streaks';

/* The Progress data (spec 8.4, plan Task C9, F21): the session count and the goal settings. */

export const DEFAULT_GOAL = 500;
export const MAX_GOAL = 100_000;
/** The largest word target of a deadline (F46). */
export const MAX_TARGET = 10_000_000;
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
const ISO_MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

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
  change: Partial<GoalSettings> & {
    toggleRestDay?: number;
    deadline?: Deadline | null;
    challenge?: Challenge | null;
  },
): Promise<void> {
  const goal = change.goalWordsPerDay;
  if (goal !== undefined && (!Number.isInteger(goal) || goal < 1 || goal > MAX_GOAL))
    throw new RangeError(`Type a goal from 1 to ${MAX_GOAL.toLocaleString()} words.`);
  const deadline = change.deadline;
  if (deadline && !ISO_DAY.test(deadline.date)) throw new RangeError('Pick a date to finish by.');
  if (deadline && (!Number.isInteger(deadline.words) || deadline.words < 1 || deadline.words > MAX_TARGET))
    throw new RangeError(`Type a target from 1 to ${MAX_TARGET.toLocaleString()} words.`);
  if (deadline?.from !== undefined && !(Number.isInteger(deadline.from) && deadline.from >= 0))
    throw new RangeError('The words of the project are wrong.');
  if (deadline?.since !== undefined && !ISO_DAY.test(deadline.since))
    throw new RangeError('The day of the deadline is wrong.');
  const challenge = change.challenge;
  if (challenge && !ISO_MONTH.test(challenge.month)) throw new RangeError('Pick a month.');
  if (
    challenge &&
    (!Number.isInteger(challenge.words) || challenge.words < 1 || challenge.words > MAX_TARGET)
  )
    throw new RangeError(`Type a target from 1 to ${MAX_TARGET.toLocaleString()} words.`);
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
        ...(deadline
          ? {
              deadline: {
                date: deadline.date,
                words: deadline.words,
                ...(deadline.from === undefined ? {} : { from: deadline.from }),
                ...(deadline.since === undefined ? {} : { since: deadline.since }),
              },
            }
          : {}),
        ...(challenge ? { challenge: { month: challenge.month, words: challenge.words } } : {}),
      };
      if (deadline === null) delete project.settings.deadline;
      if (challenge === null) delete project.settings.challenge;
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

export interface TodayGoal {
  /** The words to write today, or to remove with a goal to cut. */
  goal: number;
  /** The words written today, or removed with a goal to cut. Never under 0. */
  done: number;
  cut: boolean;
}

/**
 * Today's goal of a project: the deadline's daily goal while a deadline runs, else the words a day. Null when
 * the writer has not turned goals on. The Progress screen and the goal on the writing screen use it.
 */
export function todayGoal(
  settings: Project['settings'],
  total: number,
  today = dayKey(clock.now()),
): TodayGoal | null {
  if (!settings.streaksEnabled) return null;
  const deadline = settings.deadline;
  const record = goalRecord(deadline, total, settings.wordsByDay ?? {}, today);
  const plan = deadline ? deadlineGoal(deadline, total, record, settings.restDays, today) : null;
  // A goal to cut runs until its date or its target. After that, a day counts the words it adds again.
  const cut = plan !== null && deadline !== undefined && isCut(deadline);
  return {
    goal: plan?.perDay ?? goalsOf(settings).goalWordsPerDay,
    done: wordsOn(record, today, cut),
    cut,
  };
}
