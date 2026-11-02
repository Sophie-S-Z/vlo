import { Timer } from 'lucide-react';
import { useEffect, useState } from 'react';
import { clock } from '@/lib/clock';
import type { Session } from '@/lib/db';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
} from '@/ui/alert-dialog';
import { Button } from '@/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/ui/dropdown-menu';
import { endSession, projectTotals, startSession } from './sessions';

export const SESSION_LENGTHS = [10, 15, 25, 45, 60] as const;

interface Running {
  session: Session;
  /** Planned end time in ms. */
  endsAt: number;
  minutes: number;
  start: { words: number; poems: number };
  /** True once the time is up and the writer chose to keep writing. */
  overtime: boolean;
}

const RADIUS = 9;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

function clockText(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${String(minutes)}:${String(seconds).padStart(2, '0')}`;
}

function wordsText(words: number): string {
  return `${words.toLocaleString()} ${words === 1 ? 'word' : 'words'}`;
}

/**
 * A writing session timer. At the end a gentle prompt asks to close the session. Nothing is lost or
 * counted against the writer if they keep going. The ring updates once a second, outside the editor.
 */
export function SessionTimer({ projectId }: { projectId: string }) {
  const [running, setRunning] = useState<Running | null>(null);
  const [now, setNow] = useState(() => clock.now());
  const [asking, setAsking] = useState(false);
  const [message, setMessage] = useState('');

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

  async function start(minutes: number) {
    const [session, totals] = await Promise.all([startSession(projectId, minutes), projectTotals(projectId)]);
    const startedAt = session.startedAt;
    setNow(startedAt);
    setMessage(`Session started. ${String(minutes)} minutes.`);
    setRunning({ session, endsAt: startedAt + minutes * 60_000, minutes, start: totals, overtime: false });
  }

  async function close() {
    if (!running) return;
    const totals = await projectTotals(projectId);
    const words = Math.max(0, totals.words - running.start.words);
    await endSession(running.session.id, words, totals.poems - running.start.poems);
    setRunning(null);
    setAsking(false);
    setMessage(`Session closed. You wrote ${wordsText(words)}.`);
  }

  const left = running ? running.endsAt - now : 0;
  const minutesLeft = Math.max(1, Math.ceil(left / 60_000));
  const fraction = running ? Math.min(1, Math.max(0, left / (running.minutes * 60_000))) : 0;

  return (
    <>
      {running === null ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" className="max-sm:min-w-11 max-sm:px-0">
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
          </DropdownMenuContent>
        </DropdownMenu>
      ) : (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              aria-label={
                running.overtime ? 'Session open' : `Session timer, ${String(minutesLeft)} minutes left`
              }
            >
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
              <span aria-hidden="true" className="font-mono tabular-nums">
                {running.overtime ? 'Session open' : clockText(left)}
              </span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => void close()}>Close session</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
      <p role="status" className="sr-only">
        {message}
      </p>

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
