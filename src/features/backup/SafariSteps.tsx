import { useLiveQuery } from 'dexie-react-hooks';
import { X } from 'lucide-react';
import { useId, useState } from 'react';
import { db } from '@/lib/db';
import { cn } from '@/ui/cn';
import { currentSafariDevice, SAFARI_STEPS_CLOSED, type SafariDevice } from './safari';

/* The steps to install Vlo from Safari (spec section 9), in the Library and in Settings. */

const STEPS: Record<SafariDevice, string[]> = {
  mac: [
    'Back up each project from its card.',
    'In the Safari menu bar, choose File, then Add to Dock.',
    'Open Vlo from the Dock, then choose Import backup for each file.',
  ],
  ios: [
    'Back up each project from its card.',
    'Tap the Share button, then Add to Home Screen.',
    'Open Vlo from the Home Screen, then choose Import backup for each file.',
  ],
};

interface SafariStepsProps {
  /** In the Library the writer can close the steps. Settings always shows them. */
  closable: boolean;
  className?: string;
}

export function SafariSteps({ closable, className }: SafariStepsProps) {
  const [device] = useState(currentSafariDevice);
  const headingId = useId();
  const closed = useLiveQuery(
    async () => {
      try {
        return (await db.appMeta.get(SAFARI_STEPS_CLOSED))?.value === true;
      } catch {
        return false;
      }
    },
    [],
    null,
  );
  // Wait for the stored answer, so the steps do not flash in and out.
  if (device === null || (closable && closed !== false)) return null;

  return (
    <section
      aria-labelledby={headingId}
      className={cn(
        'relative grid gap-2 rounded-[var(--radius-card)] border border-rule bg-surface p-5',
        className,
      )}
    >
      <h2 id={headingId} className={cn('font-display text-xl font-semibold', closable && 'pr-12')}>
        Install Vlo to keep your work
      </h2>
      <p className="text-sm text-muted">
        Safari can clear a website&apos;s data after 7 days without a visit. Vlo as an app keeps its data. The
        app has its own storage, so your projects move to it through backups.
      </p>
      <ol className="grid list-decimal gap-1 pl-5 text-sm">
        {STEPS[device].map((step) => (
          <li key={step}>{step}</li>
        ))}
      </ol>
      {closable && (
        <button
          type="button"
          aria-label="Close the install steps"
          className="absolute top-3 right-3 inline-flex size-11 items-center justify-center rounded-md text-muted hover:bg-bg hover:text-text"
          onClick={() => {
            void db.appMeta.put({ key: SAFARI_STEPS_CLOSED, value: true }).catch(() => undefined);
          }}
        >
          <X aria-hidden="true" className="size-5" />
        </button>
      )}
    </section>
  );
}
