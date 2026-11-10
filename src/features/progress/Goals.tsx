import { useId, useState } from 'react';
import { formatWords } from '@/features/library/format';
import { clock } from '@/lib/clock';
import type { Project } from '@/lib/db';
import { countUnit } from '@/lib/wordcount';
import { Input } from '@/ui/input';
import { Label } from '@/ui/label';
import { Switch } from '@/ui/switch';
import { cn } from '@/ui/cn';
import { CountUp } from './CountUp';
import { Button } from '@/ui/button';
import { goalsOf, MAX_GOAL, MAX_TARGET, setGoals } from './progress';
import {
  DAY_NAME,
  DAY_SHORT,
  dayKey,
  deadlineGoal,
  lastDays,
  streakOf,
  WEEK,
  weekdayOf,
  type DayState,
} from './streaks';

/*
 * The daily goal and the streak (spec 8.4, plan Task C9, F21). Both are off by default. A rest day keeps
 * the streak. The last weeks show as a calendar, Monday first. A deadline (F46) sets the goal from the
 * words left and the writing days left.
 */

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

const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'long', timeZone: 'UTC' });

/** "Finish by": a date and a word target that set the daily goal (F46). */
function Deadline({ project, total, save }: { project: Project; total: number; save: Save }) {
  const id = useId();
  const unit = countUnit(project.settings.language);
  const words = (n: number) => formatWords(n, unit);
  const deadline = project.settings.deadline;
  const [date, setDate] = useState('');
  const [target, setTarget] = useState('');
  if (deadline) {
    const today = dayKey(clock.now());
    const plan = deadlineGoal(
      deadline,
      total,
      project.settings.wordsByDay ?? {},
      project.settings.restDays,
      today,
    );
    const when = dateFormat.format(new Date(`${deadline.date}T00:00:00Z`));
    return (
      <div className="grid gap-2" data-testid="deadline">
        <p>
          Finish by <strong className="font-semibold">{when}</strong> with {words(deadline.words)} in all.{' '}
          {plan
            ? `${words(Math.max(0, deadline.words - total))} left: ${words(plan.perDay)} a day over ${plan.daysLeft.toLocaleString()} writing ${plan.daysLeft === 1 ? 'day' : 'days'}.`
            : total >= deadline.words
              ? 'You reached the target.'
              : 'The date has passed.'}
        </p>
        <Button
          variant="outline"
          className="justify-self-start"
          onClick={() => {
            save({ deadline: null });
          }}
        >
          Remove the deadline
        </Button>
      </div>
    );
  }
  return (
    <form
      className="flex flex-wrap items-end gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        save({ deadline: { date, words: Number(target.trim()) } });
      }}
    >
      <div className="grid gap-1.5">
        <Label htmlFor={`${id}-date`}>Finish by</Label>
        <Input
          id={`${id}-date`}
          type="date"
          required
          value={date}
          onChange={(event) => {
            setDate(event.target.value);
          }}
        />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor={`${id}-words`}>{unit === 'words' ? 'Words' : 'Characters'} in all by then</Label>
        <Input
          id={`${id}-words`}
          type="number"
          inputMode="numeric"
          required
          min={1}
          max={MAX_TARGET}
          className="max-w-40"
          value={target}
          onChange={(event) => {
            setTarget(event.target.value);
          }}
        />
      </div>
      <Button type="submit" variant="outline">
        Set a deadline
      </Button>
    </form>
  );
}

type Save = (change: Parameters<typeof setGoals>[1]) => void;

export function Goals({ project, total }: { project: Project; total: number }) {
  const unit = countUnit(project.settings.language);
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

  const save: Save = (change) => {
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
  const deadline = project.settings.deadline;
  const plan = deadline ? deadlineGoal(deadline, total, record, restDays, today) : null;
  const goal = plan?.perDay ?? goals.goalWordsPerDay;
  const rules = { goal, restDays };
  const streak = streakOf(record, rules, today);
  // Whole weeks, Monday first, ending with the week of today.
  const count = (WEEKS_SHOWN - 1) * 7 + WEEK.indexOf(weekdayOf(today)) + 1;
  const recent = lastDays(record, rules, today, count);
  const met = recent.filter((d) => d.state === 'met').length;
  const rest = recent.filter((d) => d.state === 'rest').length;
  const share = Math.min(1, streak.today / goal);

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
          Off until you want it. A goal counts the {unit} you add each day, and a rest day never breaks a
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
                of {goal.toLocaleString()} {unit} today
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

            <div className={cn('grid gap-1.5', deadline && 'hidden')}>
              <Label htmlFor={`${id}-goal`}>{unit === 'words' ? 'Words' : 'Characters'} a day</Label>
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
            </div>
            <Deadline project={project} total={total} save={save} />
            <p id={`${id}-error`} role="alert" className="text-sm text-accent-text empty:hidden">
              {error}
            </p>

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
                  title={`${entry.day}: ${formatWords(entry.words, unit)}`}
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
