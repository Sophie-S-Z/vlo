import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { useDocumentTitle } from '@/app/useDocumentTitle';
import { Button } from '@/ui/button';
import { chooseProfileLater, type Profile } from './profile';
import { ProfileForm } from './ProfileForm';
import { refreshProfile } from './profileServer';
import { readSession } from './session';
import { safePath } from './SignInForm';

/*
 * The name step after a first sign-in (ADR 0011). It reads as the page after the title page: the writer
 * gives the name of the account, and a photo if they like. An account that has a profile on the server
 * goes on at once. When the server does not answer, "Not now" lets the writer go on in this tab.
 */

type State = { kind: 'loading' } | { kind: 'form'; initial: Profile; failed: boolean };

export function ProfileSetupPage() {
  useDocumentTitle('Your name');
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const next = safePath(params.get('next'));
  const [state, setState] = useState<State>({ kind: 'loading' });

  useEffect(() => {
    const ended = new AbortController();
    // A call, so TypeScript reads the flag again after each wait.
    const stopped = () => ended.signal.aborted;
    void (async () => {
      const session = await readSession().catch(() => null);
      if (stopped()) return;
      if (!session) {
        void navigate(`/sign-in?next=${encodeURIComponent(next)}`, { replace: true });
        return;
      }
      const initial: Profile = { name: session.name ?? '', called: '', penName: '', bio: '', photo: null };
      try {
        const found = await refreshProfile();
        if (stopped()) return;
        if (found) void navigate(next, { replace: true });
        else setState({ kind: 'form', initial, failed: false });
      } catch {
        if (!stopped()) setState({ kind: 'form', initial, failed: true });
      }
    })();
    return () => {
      ended.abort();
    };
  }, [navigate, next]);

  return (
    <div className="grain flex min-h-dvh flex-col items-center px-4">
      <main className="flex w-full max-w-sm flex-1 flex-col justify-center py-12">
        <p aria-hidden="true" className="text-center font-display text-5xl font-semibold leading-none">
          Vlo
        </p>
        <div aria-hidden="true" className="mx-auto mt-6 h-px w-16 bg-text" />
        <h1 className="mt-6 text-center font-display text-3xl font-semibold">What is your name?</h1>
        <p className="mt-2 text-center text-balance text-muted">
          Your name goes with your account, so Vlo greets you by name on each device.
        </p>
        <div className="mt-8">
          {state.kind === 'loading' ? (
            <p role="status" className="text-center text-sm text-muted">
              Opening your account.
            </p>
          ) : (
            <ProfileForm
              initial={state.initial}
              submitLabel="Continue"
              onSaved={() => {
                void navigate(next, { replace: true });
              }}
              footer={
                state.failed && (
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => {
                      chooseProfileLater();
                      void navigate(next, { replace: true });
                    }}
                  >
                    Not now
                  </Button>
                )
              }
            />
          )}
        </div>
      </main>
    </div>
  );
}
