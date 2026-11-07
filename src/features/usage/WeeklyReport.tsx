import { useEffect, useId, useState } from 'react';
import { ShareError, sharingReady } from '@/features/share/rpc';
import { clock } from '@/lib/clock';
import { Button } from '@/ui/button';
import { handleWeek, sendReport, weeklyReport, type UsageReport } from './usage';

/*
 * The weekly usage prompt in the Library (plan Task E5, decision S6). It shows the exact JSON that goes,
 * with Send and Skip this week. Nothing goes until the writer chooses Send.
 */

export function WeeklyReport() {
  const id = useId();
  const [pending, setPending] = useState<{ week: string; report: UsageReport } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState('');

  useEffect(() => {
    if (!sharingReady()) return;
    let live = true;
    weeklyReport(clock.now()).then(
      (next) => {
        if (live) setPending(next);
      },
      () => undefined,
    );
    return () => {
      live = false;
    };
  }, []);

  if (!pending)
    return done === '' ? null : (
      <p role="status" className="mt-8 text-sm text-muted">
        {done}
      </p>
    );

  const { week, report } = pending;
  return (
    <section
      aria-labelledby={`${id}-title`}
      className="mt-8 grid gap-3 rounded-[var(--radius-card)] border border-rule bg-surface p-5"
    >
      <h2 id={`${id}-title`} className="font-display text-xl font-semibold">
        Usage counts for last week
      </h2>
      <p className="text-sm text-muted">
        You turned on usage counts. This is the exact text that Send gives to Vlo, for week {week}. It holds
        no text, title or name.
      </p>
      <pre
        aria-label="The report"
        className="overflow-x-auto rounded-[var(--radius-card)] bg-bg p-3 font-mono text-xs"
      >
        {JSON.stringify(report, null, 2)}
      </pre>
      {error !== null && (
        <p role="alert" className="text-sm text-accent-text">
          {error}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          disabled={busy}
          onClick={() => {
            setBusy(true);
            setError(null);
            sendReport(week, report).then(
              () => {
                setPending(null);
                setDone('Sent.');
              },
              (problem: unknown) => {
                setBusy(false);
                setError(
                  problem instanceof ShareError ? problem.message : 'Vlo could not send it. Try again.',
                );
              },
            );
          }}
        >
          {busy ? 'Sending' : 'Send'}
        </Button>
        <Button
          type="button"
          variant="ghost"
          disabled={busy}
          onClick={() => {
            void handleWeek(week).then(
              () => {
                setPending(null);
                setDone('Skipped. Vlo sent nothing for that week.');
              },
              () => {
                setPending(null);
              },
            );
          }}
        >
          Skip this week
        </Button>
      </div>
    </section>
  );
}
