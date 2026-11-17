import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useState } from 'react';
import { formatBytes } from '@/lib/bytes';
import { db } from '@/lib/db';
import { PERSISTENCE_KEY, recordPersistence } from '@/lib/storage';
import { Button } from '@/ui/button';

type Reading<T> = { status: 'checking' } | { status: 'known'; value: T } | { status: 'unknown' };

interface StorageState {
  usage: Reading<number>;
  quota: Reading<number>;
  persisted: Reading<boolean>;
}

const CHECKING: StorageState = {
  usage: { status: 'checking' },
  quota: { status: 'checking' },
  persisted: { status: 'checking' },
};

function show<T>(reading: Reading<T>, format: (value: T) => string): string {
  if (reading.status === 'checking') return 'Checking';
  if (reading.status === 'unknown') return 'Unknown';
  return format(reading.value);
}

function settle<T>(result: PromiseSettledResult<T | undefined>): Reading<T> {
  return result.status === 'fulfilled' && result.value !== undefined
    ? { status: 'known', value: result.value }
    : { status: 'unknown' };
}

export function StorageHealth() {
  const [state, setState] = useState<StorageState>(CHECKING);
  const supported = typeof navigator !== 'undefined' && 'storage' in navigator;
  // The browser's last answer when Vlo asked for protection.
  const asked = useLiveQuery(async () => (await db.appMeta.get(PERSISTENCE_KEY))?.value ?? null);
  // Each request for protection reads the storage again, because some browsers then give a larger limit.
  const [reads, setReads] = useState(0);
  const [asking, setAsking] = useState(false);

  useEffect(() => {
    if (!supported) return;
    let cancelled = false;
    const estimate = navigator.storage.estimate();
    void Promise.allSettled([
      estimate.then((e) => e.usage),
      estimate.then((e) => e.quota),
      navigator.storage.persisted(),
    ]).then(([usage, quota, persisted]) => {
      if (!cancelled) setState({ usage: settle(usage), quota: settle(quota), persisted: settle(persisted) });
    });
    return () => {
      cancelled = true;
    };
  }, [supported, reads]);

  if (!supported) {
    return <p className="text-muted">This browser does not report storage use.</p>;
  }

  const unprotected = state.persisted.status === 'known' && !state.persisted.value && asked !== 'unsupported';
  return (
    <div className="grid gap-4">
      <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
        <dt className="text-muted">Used</dt>
        <dd className="tabular-nums">{show(state.usage, formatBytes)}</dd>
        <dt className="text-muted">Limit for Vlo</dt>
        <dd>
          <span className="tabular-nums">{show(state.quota, formatBytes)}</span>
          <span className="block text-muted">
            The browser sets this limit from the free space on this device. A long novel uses a few MB.
            Protected data gets the largest limit in Firefox, and an installed Vlo gets a larger limit in
            Safari.
          </span>
        </dd>
        <dt className="text-muted">Protected from clean-up</dt>
        <dd>
          {show(state.persisted, (persisted) => {
            if (persisted) return 'Yes. The browser keeps Vlo data when space runs low.';
            if (asked === 'denied' || asked === 'granted')
              return 'Not yet. The browser declined. Vlo asks again each week, and browsers often agree after you install Vlo as an app. Until then, back up often.';
            if (asked === 'unsupported')
              return 'No. This browser cannot protect site data, so back up often.';
            return 'Not yet. Vlo asks for protection when you create your first project.';
          })}
        </dd>
      </dl>
      {unprotected && (
        <Button
          type="button"
          variant="outline"
          className="justify-self-start"
          disabled={asking}
          onClick={() => {
            setAsking(true);
            void recordPersistence().finally(() => {
              setAsking(false);
              setReads((n) => n + 1);
            });
          }}
        >
          {asking ? 'Asking the browser…' : 'Ask the browser to protect Vlo data'}
        </Button>
      )}
    </div>
  );
}
