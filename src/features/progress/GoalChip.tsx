import { Link } from 'react-router';
import type { Project } from '@/lib/db';
import { countUnit } from '@/lib/wordcount';
import { Button } from '@/ui/button';
import { todayGoal } from './progress';

/*
 * Today's goal on the writing screen. With goals on, a small ring fills as the writer types toward the
 * day's goal, and the button opens Progress. A goal to cut fills as the writer removes words.
 */

const RADIUS = 9;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export function GoalChip({ project, total }: { project: Project; total: number }) {
  const goal = todayGoal(project.settings, total);
  if (!goal) return null;
  const unit = countUnit(project.settings.language);
  const share = Math.min(1, goal.done / Math.max(1, goal.goal));
  const met = goal.done >= goal.goal;
  return (
    <Button asChild variant="ghost" className="max-sm:min-w-11 max-sm:px-0" data-testid="goal-chip">
      <Link to={`/p/${project.id}/progress`} title={goal.cut ? 'Today’s goal to cut' : 'Today’s goal'}>
        <svg viewBox="0 0 24 24" aria-hidden="true" className="size-5 -rotate-90">
          <circle cx="12" cy="12" r={RADIUS} fill="none" stroke="var(--rule)" strokeWidth="2.5" />
          <circle
            cx="12"
            cy="12"
            r={RADIUS}
            fill="none"
            stroke="var(--accent)"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeDasharray={CIRCUMFERENCE}
            strokeDashoffset={CIRCUMFERENCE * (1 - share)}
            className="vlo-goal-ring"
          />
        </svg>
        {/* The name holds the visible numbers, so a voice command that says them works (WCAG 2.5.3). */}
        <span>
          <span className="sr-only">Today&rsquo;s goal: </span>
          <span className="tabular-nums max-sm:sr-only">
            {goal.done.toLocaleString()} of {goal.goal.toLocaleString()}
          </span>
          <span className="sr-only">
            {' '}
            {unit}
            {goal.cut ? ' cut' : ''}
            {met ? '. Goal met.' : ''}
          </span>
        </span>
      </Link>
    </Button>
  );
}
