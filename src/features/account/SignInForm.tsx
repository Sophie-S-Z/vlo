import { useId, useState } from 'react';
import { Button } from '@/ui/button';
import { Input } from '@/ui/input';
import { Label } from '@/ui/label';
import {
  AuthError,
  googleReady,
  googleSignInUrl,
  looksLikeEmail,
  passwordSignIn,
  prefersPassword,
  sendCode,
  verifyCode,
} from './auth';
import type { AccountSession } from './session';

/*
 * The email code, the password and Google sign-in (Phase 18, decision A2), for the sign-in screen and the
 * Account page. A new email gets a new account, so one form both signs in and makes an account. A password
 * works only after the writer sets one on the Account page, so a new account always starts with a code.
 */

const NEXT = 'vlo:next';

/** A path in Vlo, never another site. */
export function safePath(path: string | null | undefined): string {
  return path?.startsWith('/') && !path.startsWith('//') && !path.startsWith('/\\') ? path : '/';
}

/** Where Vlo goes after Google sends the writer back to /account. */
export function takeNext(): string | undefined {
  try {
    const next = sessionStorage.getItem(NEXT);
    sessionStorage.removeItem(NEXT);
    return next === null ? undefined : safePath(next);
  } catch {
    return undefined;
  }
}

export function SignInForm({
  create = false,
  next,
  onSession,
}: {
  /** True when the writer makes a new account: only the words change. */
  create?: boolean;
  /** The path to open after Google, which comes back to /account. */
  next: string;
  onSession: (session: AccountSession) => Promise<void>;
}) {
  const id = useId();
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [way, setWay] = useState<'code' | 'password'>(() => (prefersPassword() ? 'password' : 'code'));
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const withPassword = way === 'password' && !create;

  async function run(task: () => Promise<void>) {
    setBusy(true);
    setMessage('');
    try {
      await task();
    } catch (error) {
      setMessage(error instanceof AuthError ? error.message : 'Vlo could not sign you in. Try again.');
      setBusy(false);
    }
    // A finished sign-in loads the account's library, so the form stays busy until the page goes.
  }

  /** Changes between the code and the password. The email stays. */
  function changeWay(next: 'code' | 'password') {
    setWay(next);
    setSent(false);
    setCode('');
    setPassword('');
    setMessage('');
  }

  const emailField = (
    <div className="grid gap-1.5">
      <Label htmlFor={`${id}-email`}>Email</Label>
      <Input
        id={`${id}-email`}
        type="email"
        autoComplete={withPassword ? 'username' : 'email'}
        inputMode="email"
        value={email}
        onChange={(event) => {
          setEmail(event.target.value);
        }}
      />
    </div>
  );
  const checkEmail = () => {
    if (looksLikeEmail(email)) return true;
    setMessage('Type your whole email address, such as name@example.com.');
    return false;
  };

  return (
    <div className="grid gap-5">
      {googleReady() && (
        <>
          <Button
            type="button"
            variant="outline"
            className="min-h-12 text-base"
            disabled={busy}
            onClick={() => {
              void run(async () => {
                const url = await googleSignInUrl();
                sessionStorage.setItem(NEXT, next);
                window.location.assign(url);
              });
            }}
          >
            Continue with Google
          </Button>
          <p className="flex items-center gap-3 text-sm text-muted before:h-px before:flex-1 before:bg-rule after:h-px after:flex-1 after:bg-rule">
            or with your email
          </p>
        </>
      )}
      {withPassword ? (
        <form
          className="grid gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            if (!checkEmail()) return;
            void run(async () => {
              await onSession(await passwordSignIn(email, password));
            });
          }}
        >
          {emailField}
          <div className="grid gap-1.5">
            <Label htmlFor={`${id}-password`}>Password</Label>
            <Input
              id={`${id}-password`}
              type="password"
              autoComplete="current-password"
              aria-describedby={`${id}-forgot`}
              value={password}
              onChange={(event) => {
                setPassword(event.target.value);
              }}
            />
            <p id={`${id}-forgot`} className="text-sm text-muted">
              Forgot your password? Sign in with a code, then set a new password on the Account page.
            </p>
          </div>
          <Button type="submit" className="min-h-12 text-base" disabled={busy || password === ''}>
            Sign in
          </Button>
          <Button
            type="button"
            variant="ghost"
            disabled={busy}
            onClick={() => {
              changeWay('code');
            }}
          >
            Sign in with a code
          </Button>
        </form>
      ) : !sent ? (
        <form
          className="grid gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            if (!checkEmail()) return;
            void run(async () => {
              await sendCode(email);
              setSent(true);
              setBusy(false);
              setMessage(`Vlo sent a code to ${email.trim()}. It works for one hour.`);
            });
          }}
        >
          {emailField}
          <Button type="submit" className="min-h-12 text-base" disabled={busy}>
            Send me a code
          </Button>
          {!create && (
            <Button
              type="button"
              variant="ghost"
              disabled={busy}
              onClick={() => {
                changeWay('password');
              }}
            >
              Sign in with a password
            </Button>
          )}
        </form>
      ) : (
        <form
          className="grid gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            void run(async () => {
              await onSession(await verifyCode(email, code));
            });
          }}
        >
          <div className="grid gap-1.5">
            <Label htmlFor={`${id}-code`}>Code from the email</Label>
            <Input
              id={`${id}-code`}
              autoComplete="one-time-code"
              inputMode="numeric"
              maxLength={10}
              className="font-mono tracking-widest"
              value={code}
              onChange={(event) => {
                setCode(event.target.value);
              }}
            />
          </div>
          <Button
            type="submit"
            className="min-h-12 text-base"
            disabled={busy || code.replace(/\s/g, '').length < 6}
          >
            {create ? 'Create my account' : 'Sign in'}
          </Button>
          <Button
            type="button"
            variant="ghost"
            disabled={busy}
            onClick={() => {
              setSent(false);
              setCode('');
              setMessage('');
            }}
          >
            Use another email
          </Button>
        </form>
      )}
      <p role="status" className="text-sm">
        {message}
      </p>
    </div>
  );
}
