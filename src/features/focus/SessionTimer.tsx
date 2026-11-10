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
  /** Planned end time in ms. */
  endsAt: number;
  minutes: number;
  start: { words: number; poems: number };
  /** True once the time is up and the writer chose to keep writing. */
  overtime: boolean;
  /** The sprint room, when the writer sprints with friends (F60). */
  room?: Room;
}

const RADIUS = 9;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

function clockText(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${String(minutes)}:${String(seconds).padStart(2, '0')}`;
}

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
  const [asking, setAsking] = useState(false);
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
      setAsking(false);
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

  useEffect(() => {
    if (!running || running.overtime) return;
    const tick = () => {
      const time = clock.now();
      setNow(time);
      if (time >= running.endsAt) setAsking(true);
    };
    const timer = setInterval(tick, 1000);
    return () => {
      clearInterval(timer);
    };
  }, [running]);

  async function start(minutes: number, sprint?: Omit<SprintStart, 'minutes'>) {
    const [session, totals] = await Promise.all([
      startSession(projectId, minutes, sprint?.target),
      projectTotals(projectId),
    ]);
    const startedAt = session.startedAt;
    setNow(startedAt);
    setMessage(`${sprint ? 'Sprint' : 'Session'} started. ${String(minutes)} minutes.`);
    setRunning({
      session,
      endsAt: startedAt + minutes * 60_000,
      minutes,
      start: totals,
      overtime: false,
      ...(sprint?.room ? { room: sprint.room } : {}),
    });
  }

  async function close() {
    if (!running) return;
    runningRef.current = null;
    const words = await finishSession(projectId, running);
    setRunning(null);
    setAsking(false);
    const target = running.session.target;
    if (target === undefined) {
      setMessage(`Session closed. You wrote ${formatWords(words, unit)}.`);
      return;
    }
    // The last post gives the room the final words. The result shows without the room if it fails.
    let standings: Standing[] | undefined;
    if (running.room) standings = await postWords(running.room, words).catch(() => undefined);
    setOutcome({ words, target, minutes: running.minutes, ...(standings ? { standings } : {}) });
  }

  // The words of the running sprint so far, for its room. It changes only with the sprint.
  const startWords = running?.start.words;
  const sprintWords = useCallback(
    async () => Math.max(0, (await projectTotals(projectId)).words - (startWords ?? 0)),
    [projectId, startWords],
  );

  const left = running ? running.endsAt - now : 0;
  const fraction = running ? Math.min(1, Math.max(0, left / (running.minutes * 60_000))) : 0;

  return (
    <>
      {running === null ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="max-sm:min-w-11 max-sm:px-0">
              <Timer aria-hidden="true" className="size-4" />
              <span className="max-sm:sr-only">Timer</span>
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
              {!running.overtime && (
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
                    strokeDashoffset={CIRCUMFERENCE * (1 - fraction)}
                  />
                </svg>
              )}
              {running.overtime ? (
                'Session open'
              ) : (
                // The name holds the visible time, so a voice command that says it works (WCAG 2.5.3).
                <span>
                  <span className="sr-only">Session timer, </span>
                  <span className="tabular-nums">{clockText(left)}</span>
                  <span className="sr-only"> left</span>
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
        open={asking}
        onOpenChange={(open) => {
          // Escape counts as "Keep writing", so the prompt does not come back each second.
          if (!open) setRunning((r) => (r ? { ...r, overtime: true } : r));
          setAsking(open);
        }}
      >
        <AlertDialogContent>
          <AlertDialogTitle>Close the session?</AlertDialogTitle>
          <AlertDialogDescription>
            Your {running?.minutes ?? ''} minutes are up. You can close the session now or keep writing.
          </AlertDialogDescription>
          <div className="flex flex-wrap justify-end gap-2">
            <AlertDialogCancel asChild>
              <Button variant="outline">Keep writing</Button>
            </AlertDialogCancel>
            <AlertDialogAction asChild>
              <Button onClick={() => void close()}>Close session</Button>
            </AlertDialogAction>
          </div>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
