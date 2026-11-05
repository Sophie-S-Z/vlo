import { useId, useState } from 'react';
import { clock } from '@/lib/clock';
import type { Project } from '@/lib/db';
import { Input } from '@/ui/input';
import { Label } from '@/ui/label';
import { Switch } from '@/ui/switch';
import { cn } from '@/ui/cn';
import { CountUp } from './CountUp';
import { goalsOf, MAX_GOAL, setGoals } from './progress';
import { dayKey, lastDays, streakOf, weekdayOf, type DayState } from './streaks';

/*
 * The daily goal and the streak (spec 8.4, plan Task C9, F21). Both are off by default. A rest day keeps
 * the streak. The last weeks show as a calendar, Monday first.
 */

/** Monday first, as weekday numbers (0 is Sunday). */
const WEEK = [1, 2, 3, 4, 5, 6, 0];
const DAY_NAME = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const WEEKS_SHOWN = 4;

const CELL: Record<DayState, string> = {
  met: 'vlo-day-met',
  rest: 'vlo-day-rest',
  missed: 'vlo-day-missed',
  today: 'vlo-day-today',
};

function days(n: number): string {
  return `${n.toLocaleString()} ${n === 1 ? 'day' : 'days'}`;
}

export function Goals({ project }: { project: Project }) {
  const id = useId();
  const goals = goalsOf(project.settings);
  const [goalText, setGoalText] = useState(String(goals.goalWordsPerDay));
  const [shownGoal, setShownGoal] = useState(goals.goalWordsPerDay);
  const [error, setError] = useState('');
  // The rest days show the writer's change at once, before the save comes back.
  const restKey = goals.restDays.join(',');
  const [shownRest, setShownRest] = useState(restKey);
  const [restDays, setRestDays] = useState<readonly number[]>(goals.restDays);
  if (shownRest !== restKey) {
    setShownRest(restKey);
    setRestDays(goals.restDays);
  }
  // Another tab or a restore can change the goal. Show the new goal unless the writer is mid-edit.
  if (shownGoal !== goals.goalWordsPerDay) {
    setShownGoal(goals.goalWordsPerDay);
    setGoalText(String(goals.goalWordsPerDay));
  }

  const save = (change: Parameters<typeof setGoals>[1]) => {
    setGoals(project.id, change).then(
      () => {
        setError('');
      },
      (problem: unknown) => {
        setError(
          problem instanceof RangeError ? problem.message : 'Vlo could not save the goal on this device.',
        );
      },
    );
  };

  const commitGoal = () => {
    const n = Number(goalText.trim());
    if (n === goals.goalWordsPerDay) return;
    save({ goalWordsPerDay: n });
  };

  const record = project.settings.wordsByDay ?? {};
  const today = dayKey(clock.now());
  const rules = { goal: goals.goalWordsPerDay, restDays };
  const streak = streakOf(record, rules, today);
  // Whole weeks, Monday first, ending with the week of today.
  const count = (WEEKS_SHOWN - 1) * 7 + WEEK.indexOf(weekdayOf(today)) + 1;
  const recent = lastDays(record, rules, today, count);
  const met = recent.filter((d) => d.state === 'met').length;
  const rest = recent.filter((d) => d.state === 'rest').length;
  const share = Math.min(1, streak.today / goals.goalWordsPerDay);

  return (
    <section aria-labelledby={`${id}-title`} className="grid gap-4">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <h2 id={`${id}-title`} className="mr-auto font-display text-2xl font-semibold">
          Daily goal
        </h2>
        <div className="flex items-center gap-3">
          <Label htmlFor={`${id}-on`}>Track a daily goal and streak</Label>
          <Switch
            id={`${id}-on`}
            checked={goals.streaksEnabled}
            onCheckedChange={(on) => {
              save({ streaksEnabled: on });
            }}
          />
        </div>
      </div>

      {!goals.streaksEnabled ? (
        <p className="max-w-prose text-sm text-muted">
          Off until you want it. A goal counts the words you add each day, and a rest day never breaks a
          streak.
        </p>
      ) : (
        <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_auto] md:items-start">
          <div className="grid content-start gap-5">
            <div className="grid gap-2" data-testid="goal-today">
              <p className="text-lg">
                <span className="font-display text-3xl font-semibold">
                  <CountUp value={streak.today} />
                </span>{' '}
                of {goals.goalWordsPerDay.toLocaleString()} words today
                {streak.todayMet && <span className="text-accent-text">. Goal met.</span>}
              </p>
              <div aria-hidden="true" className="h-2 max-w-md overflow-hidden rounded-full bg-rule">
                <div
                  className="vlo-goal-fill h-full rounded-full bg-accent"
                  style={{ transform: `scaleX(${String(share)})` }}
                />
              </div>
            </div>
            <p data-testid="goal-streak">
              Streak: <strong className="font-semibold">{days(streak.current)}</strong>. Best:{' '}
              {days(streak.best)}.
            </p>

            <div className="grid gap-1.5">
              <Label htmlFor={`${id}-goal`}>Words a day</Label>
              <Input
                id={`${id}-goal`}
                type="number"
                inputMode="numeric"
                min={1}
                max={MAX_GOAL}
                value={goalText}
                className="max-w-40"
                aria-describedby={`${id}-error`}
                onChange={(event) => {
                  setGoalText(event.target.value);
                }}
                onBlur={commitGoal}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') commitGoal();
                }}
              />
              <p id={`${id}-error`} role="alert" className="text-sm text-accent-text empty:hidden">
                {error}
              </p>
            </div>

            <fieldset className="grid gap-2">
              <legend className="text-sm font-medium">Rest days</legend>
              <div className="flex flex-wrap gap-1">
                {WEEK.map((day) => {
                  const on = restDays.includes(day);
                  return (
                    <label
                      key={day}
                      className={cn(
                        'relative flex min-h-11 min-w-11 cursor-pointer items-center justify-center rounded-full border px-2.5 text-sm has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-accent',
                        on ? 'border-text bg-text text-bg' : 'border-rule hover:border-muted',
                      )}
                    >
                      <input
                        type="checkbox"
                        checked={on}
                        // The box covers the whole chip, so a tap anywhere on it lands on the box.
                        className="absolute inset-0 cursor-pointer appearance-none rounded-full opacity-0"
                        onChange={() => {
                          setRestDays(on ? restDays.filter((d) => d !== day) : [...restDays, day]);
                          save({ toggleRestDay: day });
                        }}
                      />
                      <span aria-hidden="true">{DAY_SHORT[day]}</span>
                      <span className="sr-only">{DAY_NAME[day]}</span>
                    </label>
                  );
                })}
              </div>
            </fieldset>
          </div>

          <figure className="grid gap-2">
            <div
              role="img"
              aria-label={`The last ${String(WEEKS_SHOWN)} weeks: goal met on ${days(met)}, with ${days(rest)} of rest.`}
              className="grid w-fit grid-cols-7 gap-1"
              data-testid="goal-calendar"
            >
              {WEEK.map((day) => (
                <span key={day} aria-hidden="true" className="pb-1 text-center text-xs text-muted">
                  {DAY_SHORT[day]?.charAt(0)}
                </span>
              ))}
              {recent.map((entry) => (
                <span
                  key={entry.day}
                  title={`${entry.day}: ${entry.words.toLocaleString()} words`}
                  data-state={entry.state}
                  className={cn('size-7 rounded-sm', CELL[entry.state])}
                />
              ))}
            </div>
            <figcaption className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted">
              <span className="inline-flex items-center gap-1.5">
                <span aria-hidden="true" className="vlo-day-met size-3 rounded-sm" />
                Goal met
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span aria-hidden="true" className="vlo-day-rest size-3 rounded-sm" />
                Rest day
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span aria-hidden="true" className="vlo-day-missed size-3 rounded-sm" />
                Under the goal
              </span>
            </figcaption>
          </figure>
        </div>
      )}
    </section>
  );
}
