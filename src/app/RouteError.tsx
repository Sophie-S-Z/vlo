import { isRouteErrorResponse, useRouteError } from 'react-router';
import { Button } from '@/ui/button';

export function RouteError() {
  const error = useRouteError();
  const detail = isRouteErrorResponse(error)
    ? `${String(error.status)} ${error.statusText}`
    : error instanceof Error
      ? error.message
      : null;

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
      <div className="mt-6">
        <Button
          onClick={() => {
            window.location.reload();
          }}
        >
          Reload Vlo
        </Button>
      </div>
    </main>
  );
}
