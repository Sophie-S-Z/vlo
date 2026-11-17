import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { useDocumentTitle } from '@/app/useDocumentTitle';
import { ACTIVE_ACCOUNT, chooseGuest, openLibrary } from '@/lib/library';
import { enterAccount } from './libraries';
import { safePath, SignInForm } from './SignInForm';

/*
 * The first screen of a signed-out visit: sign in, make an account, or write with no account. It reads as
 * the title page of a book: the name, one rule, then the form, and the choice to go on alone at the foot.
 */

export function SignInPage() {
  const [create, setCreate] = useState(false);
  useDocumentTitle(create ? 'Create your account' : 'Sign in');
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const next = safePath(params.get('next'));

  function writeAlone() {
    chooseGuest();
    // A signed-out account's library stays hidden, so the library with no account opens.
    if (ACTIVE_ACCOUNT === null) void navigate(next, { replace: true });
    else openLibrary(null, next);
  }

  return (
    <div className="grain flex min-h-dvh flex-col items-center px-4">
      <main className="flex w-full max-w-sm flex-1 flex-col justify-center py-12">
        <p
          aria-hidden="true"
          className="text-center font-display text-8xl font-semibold leading-none [font-variation-settings:'SOFT'_100,'opsz'_144] sm:text-9xl"
        >
          Vlo
        </p>
        <div aria-hidden="true" className="mx-auto mt-8 h-px w-16 bg-text" />
        <h1 className="mt-8 text-center font-display text-3xl font-semibold">
          {create ? 'Create your account' : 'Sign in'}
        </h1>
        <p className="mt-2 text-center text-muted">
          {create
            ? 'Your works go with you to each device where you sign in.'
            : 'Your works wait for you on each device where you sign in.'}
        </p>
        <div className="mt-8">
          <SignInForm create={create} next={next} onSession={(session) => enterAccount(session, next)} />
        </div>
        <p className="text-center text-sm text-muted">
          {create ? 'You have an account? ' : 'New to Vlo? '}
          <button
            type="button"
            className="font-medium text-text underline underline-offset-4"
            onClick={() => {
              setCreate(!create);
            }}
          >
            {create ? 'Sign in' : 'Create an account'}
          </button>
        </p>
      </main>
      <footer className="grid w-full max-w-sm justify-items-center gap-1 border-t border-rule py-6 text-center text-sm">
        <button type="button" className="font-medium underline underline-offset-4" onClick={writeAlone}>
          Write without an account
        </button>
        <p className="text-muted">Your works then stay on this device only.</p>
        <Link to="/privacy" className="text-muted underline underline-offset-4 hover:text-text">
          What an account sends
        </Link>
      </footer>
    </div>
  );
}
