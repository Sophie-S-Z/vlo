import { useEffect, useId, useState } from 'react';
import { sharingReady } from '@/features/share/rpc';
import { Button } from '@/ui/button';
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from '@/ui/dialog';
import { Switch } from '@/ui/switch';
import { setUsageOn, usageState, type UsageReport } from './usage';

/*
 * The usage counts switch in Settings (plan Task E5, decision S6). It is off by default. Turning it on asks
 * first, with a sample of the report. Turning it off removes the counts on this device.
 */

/** A sample report: the same keys and kinds of values as a real one. */
const SAMPLE: UsageReport = {
  templates_used: ['novel'],
  words_added_band: '1000-4999',
  poems_added_band: '0',
  features_used: ['export-docx', 'focus-mode'],
  ai_mode_counts: { pen: 3 },
  error_codes: {},
};

export function UsageSettings() {
  const id = useId();
  const [on, setOn] = useState<boolean | null>(null);
  const [asking, setAsking] = useState(false);
  const [message, setMessage] = useState('');
  const ready = sharingReady();

  useEffect(() => {
    let live = true;
    usageState().then(
      (state) => {
        if (live) setOn(state.on);
      },
      () => {
        if (live) setOn(false);
      },
    );
    return () => {
      live = false;
    };
  }, []);

  async function change(next: boolean) {
    try {
      await setUsageOn(next);
      setOn(next);
      setMessage(
        next
          ? 'Usage counts are on. Each week the Library shows the report before it goes.'
          : 'Usage counts are off. Vlo removed the counts on this device.',
      );
    } catch {
      setMessage('Vlo could not change this setting. Reload Vlo and try again.');
    }
  }

  return (
    <div className="grid gap-3">
      <p className="text-sm text-muted">
        Weekly totals help make Vlo better: which templates and features people use, and which errors happen.
        A report never holds your text, titles or names.
      </p>
      {!ready ? (
        <p className="text-sm text-muted">Usage counts are not set up in this build, so Vlo sends nothing.</p>
      ) : (
        <div className="flex items-start gap-3">
          <Switch
            id={id}
            checked={on === true}
            disabled={on === null}
            aria-describedby={`${id}-hint`}
            onCheckedChange={(next) => {
              if (next) setAsking(true);
              else void change(false);
            }}
          />
          <div className="grid gap-0.5">
            <label htmlFor={id} className="cursor-pointer">
              Send weekly usage counts
            </label>
            <p id={`${id}-hint`} className="text-sm text-muted">
              {on === true
                ? 'On. You see each report, and you choose Send or Skip this week.'
                : 'Off. Vlo counts nothing and sends nothing.'}
            </p>
          </div>
        </div>
      )}
      <p role="status" className="text-sm">
        {message}
      </p>
      <Dialog open={asking} onOpenChange={setAsking}>
        <DialogContent className="max-w-xl">
          <DialogTitle>Send weekly usage counts?</DialogTitle>
          <DialogDescription>
            Vlo counts on this device. Once a week the Library shows the report for the week before, as the
            exact text that goes. You choose Send or Skip this week each time.
          </DialogDescription>
          <section aria-labelledby={`${id}-sample`} className="grid gap-2">
            <h3 id={`${id}-sample`} className="text-sm font-semibold">
              A report looks like this
            </h3>
            <pre className="overflow-x-auto rounded-[var(--radius-card)] bg-bg p-3 font-mono text-xs">
              {JSON.stringify(SAMPLE, null, 2)}
            </pre>
          </section>
          <ul className="grid list-disc gap-1 pl-5 text-sm">
            <li>Words and poems go as a band, such as 1000-4999, not as a number.</li>
            <li>Features and errors go as names from a fixed list.</li>
            <li>No text, title, name or file leaves this device.</li>
          </ul>
          <div className="flex flex-wrap justify-end gap-2">
            <DialogClose asChild>
              <Button type="button" variant="ghost">
                Keep off
              </Button>
            </DialogClose>
            <Button
              type="button"
              onClick={() => {
                setAsking(false);
                void change(true);
              }}
            >
              Turn on
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
