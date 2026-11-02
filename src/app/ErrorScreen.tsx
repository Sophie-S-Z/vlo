import type { ReactNode } from 'react';

/** The full-page error layout. It uses no context, so the root error boundary can show it too. */
export function ErrorScreen({ detail, actions }: { detail: string | null; actions: ReactNode }) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-prose flex-col justify-center px-4 py-8">
      <h1 className="font-display text-4xl font-semibold">Something went wrong</h1>
      <p className="mt-4 text-muted">
        Vlo hit an error on this screen. Your saved writing is safe on this device. Reload Vlo to go on.
      </p>
      {detail ? (
        <p className="mt-4 font-mono text-sm text-muted">
          Error: <span>{detail}</span>
        </p>
      ) : null}
      <div className="mt-6 flex flex-wrap gap-3">{actions}</div>
    </main>
  );
}

export function reloadPage() {
  window.location.reload();
}
