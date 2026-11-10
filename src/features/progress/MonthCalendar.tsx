import { useId, useState } from 'react';
import { formatWords } from '@/features/library/format';
import { challengeState, monthOf } from '@/features/sprints/sprint';
import { clock } from '@/lib/clock';
import type { Project } from '@/lib/db';
import { countUnit } from '@/lib/wordcount';
import { Button } from '@/ui/button';
import { cn } from '@/ui/cn';
import { Input } from '@/ui/input';
import { Label } from '@/ui/label';
import { MAX_TARGET, setGoals } from './progress';
import { DAY_NAME, DAY_SHORT, dayKey, WEEK, weekdayOf } from './streaks';

/*
 * The month challenge (roadmap F60, plan Task K7): a target for the words of one month, and a calendar
 * of the words of each day. It counts the same daily words as the goal and the streak.
 */

const monthName = (month: string) =>
  new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(
    new Date(`${month}-01T00:00:00Z`),
  );
const number = new Intl.NumberFormat();

export function MonthCalendar({ project }: { project: Project }) {
  const id = useId();
  const unit = countUnit(project.settings.language);
  const [target, setTarget] = useState('');
  const [error, setError] = useState('');
  const today = dayKey(clock.now());
  const month = monthOf(today);
  const record = project.settings.wordsByDay ?? {};
  const challenge = project.settings.challenge;
  const current = challenge?.month === month ? challenge : undefined;

  const save = (change: Parameters<typeof setGoals>[1]) => {
    setGoals(project.id, change).then(
      () => {
        setError('');
      },
      (problem: unknown) => {
        setError(
          problem instanceof RangeError
            ? problem.message
            : 'Vlo could not save the challenge on this device.',
        );
      },
    );
  };

  let body;
  if (current) {
    const state = challengeState(current, record, today);
    // Blank cells before the first day, so each column is one weekday, Monday first.
    const lead = WEEK.indexOf(weekdayOf(`${month}-01`));
    const cells = [...Array<null>(lead).fill(null), ...state.days];
    const weeks = Array.from({ length: Math.ceil(cells.length / 7) }, (_, i) =>
      cells.slice(i * 7, i * 7 + 7),
    );
    body = (
      <div className="grid gap-4">
        <p className="text-lg">
          <span className="font-display text-3xl font-semibold tabular-nums">
            {number.format(state.total)}
          </span>{' '}
          of {formatWords(current.words, unit)} in {monthName(month)}.{' '}
          {state.perDay === null
            ? 'You reached the target.'
            : `Write ${formatWords(state.perDay, unit)} a day to reach it.`}
        </p>
        <div aria-hidden="true" className="h-2 max-w-md overflow-hidden rounded-full bg-rule">
          <div
            className="vlo-goal-fill h-full rounded-full bg-accent"
            style={{ transform: `scaleX(${String(Math.min(1, state.total / current.words))})` }}
          />
        </div>
        <table className="w-full max-w-md table-fixed border-separate border-spacing-1 text-sm tabular-nums">
          <caption className="sr-only">
            The {unit} of each day of {monthName(month)}
          </caption>
          <thead>
            <tr>
              {WEEK.map((day) => (
                <th key={day} scope="col" abbr={DAY_NAME[day]} className="text-xs font-normal text-muted">
                  {DAY_SHORT[day]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {weeks.map((week, row) => (
              <tr key={row}>
                {week.map((cell, column) =>
                  cell === null ? (
                    <td key={`blank ${String(column)}`} />
                  ) : (
                    <td
                      key={cell.day}
                      aria-current={cell.day === today ? 'date' : undefined}
                      className={cn(
                        'h-12 rounded-sm px-1 align-top',
                        cell.words > 0 ? 'vlo-day-met text-on-accent' : 'vlo-day-missed',
                        cell.day === today && 'vlo-day-today',
                      )}
                    >
                      <span className="block text-xs">{Number(cell.day.slice(8))}</span>
                      {cell.words > 0 && <span className="block text-xs">{number.format(cell.words)}</span>}
                    </td>
                  ),
                )}
              </tr>
            ))}
          </tbody>
        </table>
        <Button
          variant="outline"
          className="justify-self-start"
          onClick={() => {
            save({ challenge: null });
          }}
        >
          End the challenge
        </Button>
      </div>
    );
  } else {
    const past = challenge ? challengeState(challenge, record, today) : null;
    body = (
      <div className="grid gap-3">
        <p className="max-w-prose text-sm text-muted">
          {challenge && past
            ? `Your challenge for ${monthName(challenge.month)} ended at ${formatWords(past.total, unit)} of ${formatWords(challenge.words, unit)}.`
            : `Set the ${unit} to write in ${monthName(month)}. Each day of the month shows its ${unit}.`}
        </p>
        <form
          className="flex flex-wrap items-end gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            save({ challenge: { month, words: Number(target.trim()) } });
          }}
        >
          <div className="grid gap-1.5">
            <Label htmlFor={`${id}-words`}>{unit === 'words' ? 'Words' : 'Characters'} this month</Label>
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
            Start a month challenge
          </Button>
        </form>
      </div>
    );
  }

  return (
    <section aria-labelledby={`${id}-title`} className="grid gap-4">
      <h2 id={`${id}-title`} className="font-display text-2xl font-semibold">
        Month challenge
      </h2>
      {body}
      <p role="alert" className="text-sm text-accent-text empty:hidden">
        {error}
      </p>
    </section>
  );
}
