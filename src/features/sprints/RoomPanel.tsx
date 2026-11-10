import { Users } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button } from '@/ui/button';
import { cn } from '@/ui/cn';
import { Popover, PopoverContent, PopoverTrigger } from '@/ui/popover';
import { POLL_MS, postWords, roomMessage, type Room, type Standing } from './room';

/* The sprint room while a sprint runs (F60, plan Task K7): the writers of the room and their words. */

const number = new Intl.NumberFormat();

/** The writers of a room, most words first. */
export function Standings({ standings }: { standings: readonly Standing[] }) {
  return (
    <ol className="grid gap-1 tabular-nums">
      {standings.map((s, i) => (
        <li key={`${String(i)} ${s.nickname}`} className={cn('flex gap-3', s.mine && 'font-semibold')}>
          <span className="mr-auto min-w-0 [overflow-wrap:anywhere]">
            {s.nickname}
            {s.mine && <span className="sr-only"> (you)</span>}
          </span>
          <span>{number.format(s.words)}</span>
        </li>
      ))}
    </ol>
  );
}

/**
 * Posts this writer's words every 15 seconds while it is on the page, so it stops when the sprint ends.
 * `words` gives the words of the sprint so far.
 */
export function RoomPanel({ room, words }: { room: Room; words: () => Promise<number> }) {
  const [standings, setStandings] = useState<Standing[]>([]);
  const [error, setError] = useState('');
  useEffect(() => {
    let live = true;
    const post = async () => {
      try {
        const next = await postWords(room, await words());
        if (!live) return;
        setStandings(next);
        setError('');
      } catch (problem) {
        if (live) setError(roomMessage(problem));
      }
    };
    void post();
    const timer = setInterval(() => void post(), POLL_MS);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, [room, words]);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" className="max-sm:min-w-11 max-sm:px-0">
          <Users aria-hidden="true" className="size-4" />
          <span className="max-sm:sr-only">Room {room.code}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="grid gap-2">
        <p className="text-sm text-muted">
          Room <span className="font-semibold text-text">{room.code}</span>. Words in this sprint:
        </p>
        <Standings standings={standings} />
        <p role="alert" className="text-sm text-accent-text empty:hidden">
          {error}
        </p>
      </PopoverContent>
    </Popover>
  );
}
