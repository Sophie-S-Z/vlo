import { useLiveQuery } from 'dexie-react-hooks';
import { Crown } from 'lucide-react';
import { useEffect, useId, useState } from 'react';
import { Link } from 'react-router';
import { useDocumentTitle } from '@/app/useDocumentTitle';
import { dayKey } from '@/features/progress/streaks';
import { clock } from '@/lib/clock';
import { cn } from '@/ui/cn';
import { Segmented } from '@/ui/segmented';
import { Switch } from '@/ui/switch';
import '@/styles/leaderboard.css';
import { accountErrorText } from './AccountPage';
import { accountsReady } from './auth';
import { Avatar } from './Avatar';
import { readDailyCount, sendDailyCount } from './dailyCount';
import { leaderboard, showOnLeaderboard, type LeaderboardRow, type Period } from './leaderboard';
import { readSession } from './session';

/*
 * The writing leaderboard (ADR 0012): the signed-in writers who added the most words today, this week, this
 * month and this year. The first three glow in gold, silver and bronze, and the first wears a crown. The
 * board stays live: it loads again every minute while it is on the screen, and at once when it comes back.
 * A hidden tab sends no request. Calm mode and reduced motion stop the shimmer, and the colors stay.
 */

const LIVE_MS = 60_000;
const TIME = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' });

const PERIODS: { value: Period; label: string }[] = [
  { value: 'day', label: 'Today' },
  { value: 'week', label: 'This week' },
  { value: 'month', label: 'This month' },
  { value: 'year', label: 'This year' },
];

const MEDALS = ['gold', 'silver', 'bronze'] as const;
const PLACE_NAMES = ['First', 'Second', 'Third'] as const;

function Row({ row, apart }: { row: LeaderboardRow; apart: boolean }) {
  const medal = MEDALS[row.place - 1];
  return (
    <li
      data-medal={medal}
      className={cn(
        'vlo-rank flex items-center gap-3 rounded-2xl px-3 py-2.5 sm:gap-4 sm:px-4',
        row.me && !medal && 'bg-surface ring-1 ring-accent',
        apart && 'mt-6',
      )}
    >
      <span className="vlo-rank-place grid size-9 shrink-0 place-items-center rounded-full text-sm font-semibold tabular-nums">
        <span className="sr-only">{PLACE_NAMES[row.place - 1] ?? `Place ${String(row.place)}`}: </span>
        <span aria-hidden="true">{row.place}</span>
      </span>
      <span className="relative shrink-0">
        {row.place === 1 && (
          <Crown
            aria-hidden="true"
            strokeWidth={1.75}
            className="vlo-crown absolute -top-3.5 -left-2 size-6"
          />
        )}
        <Avatar profile={{ name: row.name, photo: row.photo }} className="size-11" />
      </span>
      <span className="min-w-0 flex-1 truncate font-display text-lg font-medium">
        {row.name}
        {row.me && <span className="ml-2 text-sm font-normal text-muted">(you)</span>}
      </span>
      <span className="shrink-0 text-right tabular-nums">
        <span className="font-semibold">{row.words.toLocaleString()}</span>{' '}
        <span className="text-sm text-muted">{row.words === 1 ? 'word' : 'words'}</span>
      </span>
    </li>
  );
}

function Board() {
  const id = useId();
  const [period, setPeriod] = useState<Period>('day');
  // The rows stay with their period, so a new period shows no rows of the last one.
  const [board, setBoard] = useState<{ period: Period; rows: LeaderboardRow[] } | null>(null);
  const rows = board?.period === period ? board.rows : null;
  const [at, setAt] = useState<number | null>(null);
  const [message, setMessage] = useState('');
  const [shown, setShown] = useState<boolean | null>(null);
  const countOff = readDailyCount().off;

  useEffect(() => {
    void showOnLeaderboard().then(setShown, () => undefined);
  }, []);

  // Live: the count of this device goes first, so the writer's own words are new. Then a load now, every
  // LIVE_MS while the page is on the screen, and when it comes back or goes online. A failed load keeps
  // the last board.
  useEffect(() => {
    const run = { live: true, busy: false };
    const load = async () => {
      if (run.busy || document.visibilityState !== 'visible') return;
      run.busy = true;
      try {
        await sendDailyCount();
        const next = await leaderboard(period, dayKey(clock.now()));
        if (!run.live) return;
        setBoard({ period, rows: next });
        setAt(clock.now());
        setMessage('');
      } catch (error: unknown) {
        if (run.live) setMessage(accountErrorText(error));
      } finally {
        run.busy = false;
      }
    };
    const show = () => {
      void load();
    };
    show();
    const tick = setInterval(show, LIVE_MS);
    document.addEventListener('visibilitychange', show);
    window.addEventListener('online', show);
    return () => {
      run.live = false;
      clearInterval(tick);
      document.removeEventListener('visibilitychange', show);
      window.removeEventListener('online', show);
    };
  }, [period, shown]);

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="max-w-full overflow-x-auto">
          <Segmented<Period> label="Period" options={PERIODS} value={period} onChange={setPeriod} />
        </div>
        {at !== null && (
          <p className="flex items-center gap-2 text-sm text-muted">
            <span aria-hidden="true" className="relative flex size-2.5">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-accent opacity-60" />
              <span className="relative inline-flex size-2.5 rounded-full bg-accent" />
            </span>
            Live, updated at {TIME.format(at)}
          </p>
        )}
      </div>

      {rows === null ? (
        <p role="status" className="text-sm">
          {message || 'Loading the leaderboard.'}
        </p>
      ) : rows.length === 0 ? (
        <p className="py-10 text-center font-manuscript text-2xl text-muted italic">
          No words yet. The first word wins.
        </p>
      ) : (
        <ol
          aria-label={`Leaderboard, ${PERIODS.find((p) => p.value === period)?.label ?? ''}`}
          className="grid gap-2"
        >
          {rows.map((row, i) => (
            <Row
              key={`${String(i)}-${row.name}`}
              row={row}
              apart={row.me && i > 0 && i === rows.length - 1 && i >= 50}
            />
          ))}
        </ol>
      )}
      {rows !== null && message && (
        <p role="status" className="text-sm">
          {message}
        </p>
      )}

      <div className="grid gap-3 border-t border-rule pt-6">
        {shown !== null && (
          <div className="flex items-start gap-3">
            <Switch
              id={`${id}-show`}
              checked={shown}
              aria-describedby={`${id}-show-hint`}
              onCheckedChange={(on) => {
                setShown(on);
                void showOnLeaderboard(on).then(setShown, (error: unknown) => {
                  setShown(!on);
                  setMessage(accountErrorText(error));
                });
              }}
            />
            <div className="grid gap-0.5">
              <label htmlFor={`${id}-show`} className="cursor-pointer">
                Show me on the leaderboard
              </label>
              <p id={`${id}-show-hint`} className="text-sm text-muted">
                Other signed-in writers see your pen name, or else the name that Vlo greets you by, your photo
                and your word count. Never your writing.
              </p>
            </div>
          </div>
        )}
        <p className="text-sm text-muted">
          {countOff ? (
            <>
              Your words do not count now, because the daily count is off on this device. Turn on{' '}
              <Link to="/settings" className="underline underline-offset-4">
                Count this device and its words
              </Link>{' '}
              in Settings.
            </>
          ) : (
            'The words that you add count while the daily count is on in Settings. Today, this week, this month and this year follow the calendar of each writer.'
          )}
        </p>
      </div>
    </div>
  );
}

export function LeaderboardPage() {
  useDocumentTitle('Leaderboard');
  const signedIn = useLiveQuery(async () => (await readSession().catch(() => null)) !== null, [], null);
  return (
    <section className="mx-auto grid max-w-3xl gap-8">
      <header className="grid gap-2 text-center">
        <h1 className="font-manuscript text-5xl leading-[1.05] font-light tracking-[-0.02em] italic">
          Leaderboard
        </h1>
        <p className="text-muted">Who wrote the most words? Every word you add moves you up.</p>
      </header>
      {!accountsReady() ? (
        <p className="text-center text-muted">Accounts are not set up in this build.</p>
      ) : signedIn === null ? null : signedIn ? (
        <Board />
      ) : (
        <p className="text-center">
          <Link to="/account">Sign in</Link> to see the leaderboard and to join it.
        </p>
      )}
    </section>
  );
}
