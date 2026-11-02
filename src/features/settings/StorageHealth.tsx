import { useEffect, useState } from 'react';

interface StorageState {
  usage: number | null;
  quota: number | null;
  persisted: boolean | null;
}

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

export function StorageHealth() {
  const [state, setState] = useState<StorageState>({ usage: null, quota: null, persisted: null });
  const supported = typeof navigator !== 'undefined' && 'storage' in navigator;

  useEffect(() => {
    if (!supported) return;
    let cancelled = false;
    void Promise.all([navigator.storage.estimate(), navigator.storage.persisted()]).then(
      ([estimate, persisted]) => {
        if (!cancelled) setState({ usage: estimate.usage ?? null, quota: estimate.quota ?? null, persisted });
      },
    );
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
      <dd className="font-mono">{state.usage === null ? 'Checking' : formatBytes(state.usage)}</dd>
      <dt className="text-muted">Available</dt>
      <dd className="font-mono">{state.quota === null ? 'Checking' : formatBytes(state.quota)}</dd>
      <dt className="text-muted">Protected from clean-up</dt>
      <dd>
        {state.persisted === null
          ? 'Checking'
          : state.persisted
            ? 'Yes. The browser keeps Vlo data when space runs low.'
            : 'Not yet. Vlo asks for protection when you create your first project.'}
      </dd>
    </dl>
  );
}
