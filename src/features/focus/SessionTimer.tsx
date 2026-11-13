import { useLiveQuery } from 'dexie-react-hooks';
import { Timer } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { flushEntry } from '@/features/authorship/record';
import { postWords, type Room, type Standing } from '@/features/sprints/room';
import { RoomPanel } from '@/features/sprints/RoomPanel';
import {
  SprintDialog,
  SprintResult,
  type SprintOutcome,
  type SprintStart,
} from '@/features/sprints/SprintDialog';
import { clock } from '@/lib/clock';
import type { Session } from '@/lib/db';
import { formatWords } from '@/features/library/format';
import type { CountUnit } from '@/lib/wordcount';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
} from '@/ui/alert-dialog';
import { Button } from '@/ui/button';
import { ICON_BUTTON } from '@/ui/tip';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/ui/dropdown-menu';
import { closeSession, projectTotals, startSession } from './sessions';

export const SESSION_LENGTHS = [10, 15, 25, 45, 60] as const;

interface Running {
  session: Session;
  /** Planned end time in ms, or null for a stopwatch, which has no time limit. */
  endsAt: number | null;
  /** The planned minutes, or null for a stopwatch. */
  minutes: number | null;
  start: { words: number; poems: number };
  /** True once the time is up and the writer chose to keep writing. */
  overtime: boolean;
  /** True once a sprint reached its target and the writer chose to keep writing. */
  targetSeen: boolean;
  /** The sprint room, when the writer sprints with friends (F60). */
  room?: Room;
}

const RADIUS = 9;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

/** A time as 9:05, or 1:02:05 from one hour. Left time rounds up, so 0:00 shows only at the end. */
export function clockText(ms: number, round: 'up' | 'down' = 'up'): string {
  const total = Math.max(0, round === 'up' ? Math.ceil(ms / 1000) : Math.floor(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = String(total % 60).padStart(2, '0');
  return hours > 0
    ? `${String(hours)}:${String(minutes).padStart(2, '0')}:${seconds}`
    : `${String(minutes)}:${seconds}`;
}

/** The whole minutes of a session, at least 1, for the result of a sprint with no time limit. */
const minutesOf = (ms: number) => Math.max(1, Math.round(ms / 60_000));

/** Closes a session with what the project gained since it started. Returns the words added. */
async function finishSession(projectId: string, running: Running): Promise<number> {
  const words = await closeSession(projectId, running.session.id, running.start);
  await flushEntry(projectId).catch(() => undefined);
  return words;
}

/**
 * A writing session timer. At the end a gentle prompt asks to close the session. Nothing is lost or
 * counted against the writer if they keep going. The ring updates once a second, outside the editor.
 */
export function SessionTimer({
  projectId,
  unit,
  sprintOpen,
  onSprintOpenChange,
}: {
  projectId: string;
  unit: CountUnit;
  /** The sprint dialog, which the command menu opens too. */
  sprintOpen: boolean;
  onSprintOpenChange: (open: boolean) => void;
}) {
  const [running, setRunning] = useState<Running | null>(null);
  const [now, setNow] = useState(() => clock.now());
  /** The gentle prompt when the time is up. A sprint with no time limit asks at its target instead. */
  const [asking, setAsking] = useState<'time' | null>(null);
  const [message, setMessage] = useState('');
  const [outcome, setOutcome] = useState<SprintOutcome | null>(null);
  const runningRef = useRef<Running | null>(null);
  useEffect(() => {
    runningRef.current = running;
  }, [running]);

  // Leaving the project or closing the tab ends the session with what it added, so its record is right.
  useEffect(() => {
    const leave = () => {
      const open = runningRef.current;
      if (!open) return;
      runningRef.current = null;
      setRunning(null);
      setAsking(null);
      void finishSession(projectId, open);
    };
    window.addEventListener('pagehide', leave);
    return () => {
      window.removeEventListener('pagehide', leave);
      leave();
    };
  }, [projectId]);

  // A new language counts the project again, so a running session counts words from the change.
  useEffect(() => {
    if (!runningRef.current) return;
    let current = true;
    void projectTotals(projectId).then(({ words }) => {
      if (current) setRunning((open) => open && { ...open, start: { ...open.start, words } });
    });
    return () => {
      current = false;
    };
  }, [projectId, unit]);

  // A stopwatch ticks for as long as it runs. A timer stops ticking once the writer keeps writing past it.
  useEffect(() => {
    if (!running || (running.overtime && running.endsAt !== null)) return;
    const tick = () => {
      const time = clock.now();
      setNow(time);
      if (running.endsAt !== null && !running.overtime && time >= running.endsAt) setAsking('time');
    };
    const timer = setInterval(tick, 1000);
    return () => {
      clearInterval(timer);
    };
  }, [running]);

  async function start(minutes: number | null, sprint?: Omit<SprintStart, 'minutes'>) {
    const [session, totals] = await Promise.all([
      startSession(projectId, minutes, sprint?.target),
      projectTotals(projectId),
    ]);
    const startedAt = session.startedAt;
    setNow(startedAt);
    setMessage(
      `${sprint ? 'Sprint' : minutes === null ? 'Stopwatch' : 'Session'} started. ${minutes === null ? 'No time limit.' : `${String(minutes)} minutes.`}`,
    );
    setRunning({
      session,
      endsAt: minutes === null ? null : startedAt + minutes * 60_000,
      minutes,
      start: totals,
      overtime: false,
      targetSeen: false,
      ...(sprint?.room ? { room: sprint.room } : {}),
    });
  }

  async function close() {
    if (!running) return;
    runningRef.current = null;
    const words = await finishSession(projectId, running);
    setRunning(null);
    setAsking(null);
    const target = running.session.target;
    const took = running.minutes ?? minutesOf(clock.now() - running.session.startedAt);
    if (target === undefined) {
      setMessage(
        running.minutes === null
          ? `Session closed. You wrote ${formatWords(words, unit)} in ${String(took)} ${took === 1 ? 'minute' : 'minutes'}.`
          : `Session closed. You wrote ${formatWords(words, unit)}.`,
      );
      return;
    }
    // The last post gives the room the final words. The result shows without the room if it fails.
    let standings: Standing[] | undefined;
    if (running.room) standings = await postWords(running.room, words).catch(() => undefined);
    setOutcome({ words, target, minutes: took, ...(standings ? { standings } : {}) });
  }

  // The words of the running sprint so far, for its room. It changes only with the sprint.
  const startWords = running?.start.words;
  const sprintWords = useCallback(
    async () => Math.max(0, (await projectTotals(projectId)).words - (startWords ?? 0)),
    [projectId, startWords],
  );

  // The words of the session so far, live from the stored counts. Each save updates them.
  const totals = useLiveQuery(
    () => (startWords === undefined ? undefined : projectTotals(projectId)),
    [projectId, startWords],
  );
  const words = totals && startWords !== undefined ? Math.max(0, totals.words - startWords) : 0;
  const target = running?.session.target;

  // A sprint with no time limit ends at its target, so the gentle prompt comes then.
  const targetDue =
    running?.minutes === null && target !== undefined && !running.targetSeen && words >= target;
  const prompt = asking ?? (targetDue ? 'target' : null);

  const stopwatch = running?.endsAt === null;
  const left = running?.endsAt ? running.endsAt - now : 0;
  const fraction =
    running?.minutes && !stopwatch ? Math.min(1, Math.max(0, left / (running.minutes * 60_000))) : 0;
  // A sprint with no time limit fills its ring with words instead.
  const ring = stopwatch ? (target === undefined ? null : Math.min(1, words / target)) : fraction;
  const counted =
    target === undefined
      ? `+${formatWords(words, unit)}`
      : `${words.toLocaleString()} of ${formatWords(target, unit)}`;

  return (
    <>
      {running === null ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className={ICON_BUTTON} data-tip="Timer" data-tool="timer">
              <Timer aria-hidden="true" className="size-4" />
              <span className="sr-only">Timer</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {SESSION_LENGTHS.map((minutes) => (
              <DropdownMenuItem
                key={minutes}
                onSelect={() => {
                  void start(minutes);
                }}
              >
                Write for {minutes} minutes
              </DropdownMenuItem>
            ))}
            <DropdownMenuItem
              onSelect={() => {
                void start(null);
              }}
            >
              Stopwatch, no time limit
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onSelect={() => {
                onSprintOpenChange(true);
              }}
            >
              Start a sprint
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline">
              {ring !== null && (running.endsAt === null || !running.overtime) && (
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
                    strokeDashoffset={CIRCUMFERENCE * (1 - ring)}
                  />
                </svg>
              )}
              {stopwatch ? (
                // The name holds the visible time and count, so a voice command that says them works (WCAG 2.5.3).
                <span>
                  <span className="sr-only">Stopwatch, </span>
                  <span className="tabular-nums">{clockText(now - running.session.startedAt, 'down')}</span>
                  <span className="sr-only"> so far, </span>
                  <span className="ml-2 text-muted tabular-nums max-sm:sr-only">{counted}</span>
                </span>
              ) : running.overtime ? (
                <span>
                  Session open
                  <span className="sr-only"> with </span>
                  <span className="ml-2 text-muted tabular-nums max-sm:sr-only">{counted}</span>
                </span>
              ) : (
                <span>
                  <span className="sr-only">Session timer, </span>
                  <span className="tabular-nums">{clockText(left)}</span>
                  <span className="sr-only"> left, </span>
                  <span className="ml-2 text-muted tabular-nums max-sm:sr-only">{counted}</span>
                </span>
              )}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => void close()}>
              {running.session.target === undefined ? 'Close session' : 'End the sprint'}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
      {running?.room && <RoomPanel room={running.room} words={sprintWords} />}
      <p role="status" className="sr-only">
        {message}
      </p>
      <SprintDialog
        // One session at a time: a sprint starts only when no session runs.
        open={sprintOpen && running === null}
        onOpenChange={onSprintOpenChange}
        lengths={SESSION_LENGTHS}
        unit={unit}
        onStart={({ minutes, ...sprint }) => start(minutes, sprint)}
      />
      <SprintResult
        outcome={outcome}
        unit={unit}
        onClose={() => {
          setOutcome(null);
        }}
      />

      <AlertDialog
        open={prompt !== null}
        onOpenChange={(open) => {
          // Escape counts as "Keep writing", so the prompt does not come back each second.
          if (!open)
            setRunning((r) =>
              r ? (prompt === 'target' ? { ...r, targetSeen: true } : { ...r, overtime: true }) : r,
            );
          if (!open) setAsking(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogTitle>
            {prompt === 'target' ? 'You reached your target' : 'Close the session?'}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {prompt === 'target'
              ? `You wrote ${counted}. You can end the sprint now or keep writing.`
              : `Your ${String(running?.minutes ?? '')} minutes are up. You can close the session now or keep writing.`}
          </AlertDialogDescription>
          <div className="flex flex-wrap justify-end gap-2">
            <AlertDialogCancel asChild>
              <Button variant="outline">Keep writing</Button>
            </AlertDialogCancel>
            <AlertDialogAction asChild>
              <Button onClick={() => void close()}>
                {prompt === 'target' ? 'End the sprint' : 'Close session'}
              </Button>
            </AlertDialogAction>
          </div>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
