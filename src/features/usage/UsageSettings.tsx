import { Link } from 'react-router';
import { sharingReady } from '@/features/share/rpc';
import type { UsageReport } from './usage';

/*
 * The usage counts in Settings (Phase 18, decision A3, and plan Task E5). Both counts are always on, so
 * this section has no switch. It says what each count sends and when, and it shows a sample report.
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
  if (!sharingReady())
    return (
      <p className="text-sm text-muted">Usage counts are not set up in this build, so Vlo sends nothing.</p>
    );
  return (
    <div className="grid gap-5">
      <p>
        Vlo always sends these two counts to its makers. They never hold your text, a title, a name or your
        internet address.
      </p>
      <div className="grid gap-0.5">
        <h3 className="font-medium">The daily count</h3>
        <p className="text-sm text-muted">
          Each day, and again after your projects change, Vlo sends a random id for this browser, the Vlo
          version, the kind of device, whether Vlo is installed, how many words you write and a rough place
          (country, region and city).
        </p>
      </div>
      <div className="grid gap-2">
        <div className="grid gap-0.5">
          <h3 className="font-medium">Weekly usage counts</h3>
          <p className="text-sm text-muted">
            Once a week, Vlo sends the counts of the week before by itself: the templates and features that
            you used, your words and poems as bands such as 1000-4999, AI requests by mode, and error codes.
          </p>
        </div>
        <details className="rounded-md border border-rule p-3 text-sm">
          <summary className="cursor-pointer font-medium">A weekly report looks like this</summary>
          <pre className="mt-2 overflow-x-auto rounded-[var(--radius-card)] bg-bg p-3 font-mono text-xs">
            {JSON.stringify(SAMPLE, null, 2)}
          </pre>
        </details>
      </div>
      <p className="text-sm text-muted">
        The{' '}
        <Link to="/privacy" className="underline">
          privacy page
        </Link>{' '}
        lists each thing that leaves this device.
      </p>
    </div>
  );
}
