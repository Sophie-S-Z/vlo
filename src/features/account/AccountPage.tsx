import { useLiveQuery } from 'dexie-react-hooks';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { Link } from 'react-router';
import { useDocumentTitle } from '@/app/useDocumentTitle';
import { guessDeviceName } from '@/features/sync/deviceName';
import { syncErrorText } from '@/features/sync/pairing';
import { syncedText } from '@/features/sync/space';
import { clock } from '@/lib/clock';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
} from '@/ui/alert-dialog';
import { Button } from '@/ui/button';
import { Input } from '@/ui/input';
import { Label } from '@/ui/label';
import {
  accountSyncState,
  joinAccountSync,
  stopAccountSyncHere,
  turnOnAccountSync,
  type AccountSyncState,
} from './accountSync';
import {
  accountsReady,
  AuthError,
  deleteAccount,
  finishGoogle,
  googleReady,
  googleSignInUrl,
  looksLikeEmail,
  sendCode,
  signOut,
  verifyCode,
} from './auth';
import { readSession, type AccountSession } from './session';

/*
 * The account page (Phase 18, Tasks A2 and A3). Sign in with an email code or Google, and sync turns on:
 * the first device makes the account's sync, and each next device joins it. Every project stays on the
 * device in each step.
 */

/** The writer's text for a failed call of this page. */
export function accountErrorText(error: unknown): string {
  if (error instanceof AuthError) return error.message;
  return syncErrorText(error);
}

function Status({ text }: { text: string }) {
  return (
    <p role="status" className="text-sm">
      {text}
    </p>
  );
}

function SignIn({ onSignedIn }: { onSignedIn: () => void }) {
  const id = useId();
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  async function run(task: () => Promise<void>) {
    setBusy(true);
    setMessage('');
    try {
      await task();
    } catch (error) {
      setMessage(accountErrorText(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid max-w-md gap-4">
      <p>
        Sign in to keep your projects the same on your phone, your laptop and any other device. Every project
        comes with you, finished or in progress. Vlo sends a 6-digit code to your email. You need no password.
      </p>
      {!sent ? (
        <form
          className="grid gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            if (!looksLikeEmail(email)) {
              setMessage('Type your whole email address, such as name@example.com.');
              return;
            }
            void run(async () => {
              await sendCode(email);
              setSent(true);
              setMessage(`Vlo sent a code to ${email.trim()}. It works for one hour.`);
            });
          }}
        >
          <div className="grid gap-1.5">
            <Label htmlFor={`${id}-email`}>Email</Label>
            <Input
              id={`${id}-email`}
              type="email"
              autoComplete="email"
              inputMode="email"
              value={email}
              onChange={(event) => {
                setEmail(event.target.value);
              }}
            />
          </div>
          <div>
            <Button type="submit" disabled={busy}>
              Send me a code
            </Button>
          </div>
        </form>
      ) : (
        <form
          className="grid gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            void run(async () => {
              await verifyCode(email, code);
              onSignedIn();
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
              className="max-w-40 font-mono tracking-widest"
              value={code}
              onChange={(event) => {
                setCode(event.target.value);
              }}
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={busy || code.replace(/\s/g, '').length < 6}>
              Sign in
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => {
                setSent(false);
                setCode('');
                setMessage('');
              }}
            >
              Use another email
            </Button>
          </div>
        </form>
      )}
      {googleReady() && (
        <div className="grid gap-2 border-t border-rule pt-4">
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() => {
              void run(async () => {
                window.location.assign(await googleSignInUrl());
              });
            }}
          >
            Continue with Google
          </Button>
        </div>
      )}
      <Status text={message} />
    </div>
  );
}

/** The states that turn on by themselves after a sign-in: nothing else syncs on this device. */
const AUTOMATIC: readonly AccountSyncState['kind'][] = ['off', 'adopt', 'join'];

function SyncPanel({ state, onChange }: { state: AccountSyncState; onChange: () => void }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const tried = useRef(false);

  const connect = useCallback(
    async (current: AccountSyncState) => {
      setBusy(true);
      setMessage('');
      try {
        const name = guessDeviceName();
        if (current.kind === 'join' || current.kind === 'move') await joinAccountSync(current.vault, name);
        else await turnOnAccountSync(name);
        setMessage(
          current.kind === 'off' || current.kind === 'adopt'
            ? 'Sync is on. Sign in on your other devices with the same email.'
            : 'This device syncs now. Your projects come to the Library.',
        );
        onChange();
      } catch (error) {
        setMessage(accountErrorText(error));
      } finally {
        setBusy(false);
      }
    },
    [onChange],
  );

  // A sign-in turns sync on, unless this device syncs with another set of devices: that asks first.
  useEffect(() => {
    if (tried.current || !AUTOMATIC.includes(state.kind)) return;
    tried.current = true;
    void connect(state);
  }, [state, connect]);

  let body: React.ReactNode;
  if (state.kind === 'on')
    body = (
      <>
        <p>
          This device syncs with your account. {syncedText(state.space.syncedAt, clock.now())}. Sign in on
          another device with the same email, and every project goes there too.
        </p>
        <div>
          <Button asChild variant="outline">
            <Link to="/settings#devices">See your devices</Link>
          </Button>
        </div>
      </>
    );
  else if (state.kind === 'move')
    body = (
      <>
        <p>
          This device syncs with another set of devices now, through a pairing link. Move it to your account?
          Its projects stay here and go to your other devices too.
        </p>
        <div>
          <Button
            type="button"
            disabled={busy}
            onClick={() => {
              void connect(state);
            }}
          >
            Sync this device with my account
          </Button>
        </div>
      </>
    );
  else
    body = (
      <>
        <p>
          {busy
            ? 'Turning on sync for this device.'
            : 'Sync did not start. Check the connection, then try again.'}
        </p>
        {!busy && (
          <div>
            <Button
              type="button"
              onClick={() => {
                void connect(state);
              }}
            >
              Try again
            </Button>
          </div>
        )}
      </>
    );

  return (
    <section aria-labelledby="sync-heading" className="grid gap-3 border-t border-rule pt-6">
      <h2 id="sync-heading" className="font-display text-2xl font-semibold">
        Sync on all your devices
      </h2>
      {body}
      <Status text={message} />
    </section>
  );
}

function SignedIn({ session, onSignedOut }: { session: AccountSession; onSignedOut: () => void }) {
  const [state, setState] = useState<AccountSyncState | null>(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(() => {
    accountSyncState().then(setState, (error: unknown) => {
      setMessage(accountErrorText(error));
    });
  }, []);
  useEffect(load, [load]);

  async function act(task: () => Promise<void>) {
    setBusy(true);
    setMessage('');
    try {
      await task();
      onSignedOut();
    } catch (error) {
      setMessage(accountErrorText(error));
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-6">
      <p>
        Signed in as <span className="font-semibold">{session.email || 'your account'}</span>
        {session.provider === 'google' ? ' with Google' : ''}.
      </p>
      {state ? <SyncPanel state={state} onChange={load} /> : <Status text={message} />}
      <section aria-labelledby="account-heading" className="grid gap-3 border-t border-rule pt-6">
        <h2 id="account-heading" className="font-display text-2xl font-semibold">
          Your account
        </h2>
        <p className="text-sm text-muted">
          Sign out on a device that is not yours. This device stops sync and keeps its projects.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() => {
              void act(async () => {
                if (state?.kind === 'on') await stopAccountSyncHere();
                await signOut();
              });
            }}
          >
            Sign out
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() => {
              setDeleting(true);
            }}
          >
            Delete my account
          </Button>
        </div>
        {state && <Status text={message} />}
      </section>
      <AlertDialog open={deleting} onOpenChange={setDeleting}>
        <AlertDialogContent>
          <AlertDialogTitle>Delete your account?</AlertDialogTitle>
          <AlertDialogDescription>
            The server deletes your account, your sync and every sealed copy on it. Each device keeps the
            projects that it has now, and no device syncs. You cannot undo this.
          </AlertDialogDescription>
          <div className="flex flex-wrap justify-end gap-2">
            <AlertDialogCancel asChild>
              <Button variant="outline">Keep my account</Button>
            </AlertDialogCancel>
            <AlertDialogAction asChild>
              <Button
                onClick={() => {
                  void act(async () => {
                    const synced = state?.kind === 'on';
                    await deleteAccount();
                    if (synced) await stopAccountSyncHere();
                  });
                }}
              >
                Delete my account
              </Button>
            </AlertDialogAction>
          </div>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/** The `code` or `error_description` that Google's sign-in put in the address, taken once. */
function takeReturn(): { code?: string; error?: string } {
  const params = new URLSearchParams(window.location.search);
  const code = params.get('code') ?? undefined;
  const error = params.get('error_description') ?? params.get('error') ?? undefined;
  if (code !== undefined || error !== undefined)
    window.history.replaceState(window.history.state, '', window.location.pathname);
  return { ...(code ? { code } : {}), ...(error ? { error } : {}) };
}

export function AccountPage() {
  useDocumentTitle('Account');
  const session = useLiveQuery(readSession);
  const [returned] = useState(takeReturn);
  const [message, setMessage] = useState(
    returned.error ? 'Google did not sign you in. Try again, or use an email code.' : '',
  );
  const [, setTick] = useState(0);

  useEffect(() => {
    if (!returned.code) return;
    finishGoogle(returned.code).catch((error: unknown) => {
      setMessage(accountErrorText(error));
    });
  }, [returned.code]);

  let body: React.ReactNode;
  if (!accountsReady()) body = <p>Accounts are not set up in this build, so Vlo sends nothing.</p>;
  else if (session === undefined) body = null;
  else if (session)
    body = (
      <SignedIn
        key={session.userId}
        session={session}
        onSignedOut={() => {
          setTick((n) => n + 1);
        }}
      />
    );
  else
    body = (
      <SignIn
        onSignedIn={() => {
          setTick((n) => n + 1);
        }}
      />
    );

  return (
    <div className="grid max-w-2xl gap-6">
      <h1 className="font-display text-4xl font-semibold">Account</h1>
      {body}
      <Status text={message} />
      <p className="text-sm text-muted">
        You do not need an account to write. Without one, every project stays on this device.{' '}
        <Link to="/privacy" className="underline">
          What an account sends
        </Link>
      </p>
    </div>
  );
}
