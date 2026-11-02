import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useState } from 'react';
import { db } from '@/lib/db';

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

function formatBytes(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(unit === 0 ? 0 : 1)} ${units[unit] ?? 'B'}`;
}

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
  // The answer the browser gave when Vlo asked for protection with the first project.
  const asked = useLiveQuery(async () => (await db.appMeta.get('persistence'))?.value ?? null);

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
  }, [supported]);

  if (!supported) {
    return <p className="text-muted">This browser does not report storage use.</p>;
  }

  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
      <dt className="text-muted">Used</dt>
      <dd className="font-mono">{show(state.usage, formatBytes)}</dd>
      <dt className="text-muted">Limit for Vlo</dt>
      <dd className="font-mono">{show(state.quota, formatBytes)}</dd>
      <dt className="text-muted">Protected from clean-up</dt>
      <dd>
        {show(state.persisted, (persisted) => {
          if (persisted) return 'Yes. The browser keeps Vlo data when space runs low.';
          if (asked === 'denied' || asked === 'granted')
            return 'No. The browser declined. It may clear Vlo data when space runs low, so back up often.';
          if (asked === 'unsupported') return 'No. This browser cannot protect site data, so back up often.';
          return 'Not yet. Vlo asks for protection when you create your first project.';
        })}
      </dd>
    </dl>
  );
}
