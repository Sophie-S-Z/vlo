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
import { openLibrary } from '@/lib/library';
import {
  accountSyncState,
  AUTOMATIC,
  joinAccountSync,
  startAccountSync,
  stopAccountSyncHere,
  turnOnAccountSync,
  type AccountSyncState,
} from './accountSync';
import {
  accountsReady,
  AuthError,
  deleteAccount,
  finishGoogle,
  passwordProblem,
  PASSWORD_LIMITS,
  sendPasswordCode,
  setPassword,
  signOut,
} from './auth';
import {
  bringWorks,
  enterAccount,
  leaveDeletedAccount,
  otherLibraries,
  type OtherLibrary,
} from './libraries';
import { isOwner } from './owner';
import { readSession, type AccountSession } from './session';
import { SignInForm, takeNext } from './SignInForm';

/*
 * The account page (Phase 18, Tasks A2 and A3). Sign in with an email code or Google, and sync turns on:
 * the first device makes the account's sync, and each next device joins it. Each account has its own
 * library on the device (ADR 0010), and this page brings in the projects of another library on request.
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
        if (current.kind === 'move' || current.kind === 'paused') await joinAccountSync(current.vault, name);
        else if (current.kind === 'stopped') await turnOnAccountSync(name);
        else await startAccountSync(name);
        setMessage(
          current.kind === 'off' || current.kind === 'adopt' || current.kind === 'stopped'
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
  else if (state.kind === 'paused')
    body = (
      <>
        <p>You stopped sync on this device in Settings. Your other devices still sync with your account.</p>
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
  else if (state.kind === 'stopped')
    body = (
      <>
        <p>Sync is off on all your devices. Each device keeps its projects.</p>
        <div>
          <Button
            type="button"
            disabled={busy}
            onClick={() => {
              void connect(state);
            }}
          >
            Turn on sync again
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

/**
 * A password for the account, so the writer can sign in with the email and the password, with no code. A
 * server with "Secure password change" on asks for a code from the email first.
 */
function PasswordPanel({ email }: { email: string }) {
  const id = useId();
  const [password, setPasswordText] = useState('');
  const [again, setAgain] = useState('');
  const [code, setCode] = useState('');
  const [asked, setAsked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  async function save() {
    const problem = passwordProblem(password, again);
    if (problem) {
      setMessage(problem);
      return;
    }
    setBusy(true);
    setMessage('');
    try {
      await setPassword(password, asked ? code : undefined);
      setPasswordText('');
      setAgain('');
      setCode('');
      setAsked(false);
      setMessage(
        `Your password is saved. Next time, sign in with ${email || 'your email'} and this password.`,
      );
    } catch (error) {
      if (error instanceof AuthError && error.kind === 'needs-code' && !asked) {
        try {
          await sendPasswordCode();
          setAsked(true);
          setMessage(
            `For your safety, Vlo sent a code to ${email || 'your email'}. Type it, then save again.`,
          );
        } catch (sendError) {
          setMessage(accountErrorText(sendError));
        }
      } else setMessage(accountErrorText(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-labelledby="password-heading" className="grid gap-3 border-t border-rule pt-6">
      <h2 id="password-heading" className="font-display text-2xl font-semibold">
        Password
      </h2>
      <p>
        Set a password to sign in with your email and the password, with no code. You can always sign in with
        a code too. To change your password, set a new one here.
      </p>
      <form
        className="grid max-w-sm gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        {/* A password manager keeps the password with this email. */}
        <input type="email" autoComplete="username" value={email} readOnly hidden />
        <div className="grid gap-1.5">
          <Label htmlFor={`${id}-new`}>New password</Label>
          <Input
            id={`${id}-new`}
            type="password"
            autoComplete="new-password"
            maxLength={PASSWORD_LIMITS.max}
            aria-describedby={`${id}-hint`}
            value={password}
            onChange={(event) => {
              setPasswordText(event.target.value);
            }}
          />
          <p id={`${id}-hint`} className="text-sm text-muted">
            At least {PASSWORD_LIMITS.min} characters. A long phrase is easy to remember and hard to guess.
          </p>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor={`${id}-again`}>Type the password again</Label>
          <Input
            id={`${id}-again`}
            type="password"
            autoComplete="new-password"
            maxLength={PASSWORD_LIMITS.max}
            value={again}
            onChange={(event) => {
              setAgain(event.target.value);
            }}
          />
        </div>
        {asked && (
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
        )}
        <div>
          <Button type="submit" disabled={busy || password === '' || (asked && code.trim() === '')}>
            Save password
          </Button>
        </div>
      </form>
      <Status text={message} />
    </section>
  );
}

const worksText = (n: number) => (n === 1 ? '1 project' : `${String(n)} projects`);

/**
 * The other libraries on this device: switch to an account that is signed in here, sign in to another,
 * or bring another library's projects into this account. Bringing them in copies them, so that library
 * keeps its own.
 */
function LibrariesPanel() {
  const [others, setOthers] = useState<OtherLibrary[]>([]);
  const [asking, setAsking] = useState<OtherLibrary | null>(null);
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const load = useCallback(() => {
    otherLibraries().then(setOthers, () => {
      setOthers([]);
    });
  }, []);
  useEffect(load, [load]);

  async function bring(from: OtherLibrary) {
    setBusy(true);
    setMessage('');
    try {
      const copied = await bringWorks(from);
      setMessage(
        copied === 0
          ? 'This account has each of those projects already.'
          : `${worksText(copied)} came in. They sync to your other devices too.`,
      );
    } catch (error) {
      setMessage(accountErrorText(error));
    } finally {
      setBusy(false);
      load();
    }
  }

  const name = (library: OtherLibrary) =>
    library.account === null ? 'This device, with no account' : library.email || 'Another account';

  return (
    <section aria-labelledby="libraries-heading" className="grid gap-3 border-t border-rule pt-6">
      <h2 id="libraries-heading" className="font-display text-2xl font-semibold">
        Your accounts on this device
      </h2>
      <p>
        Each account has its own projects. To see the projects of another account here too, bring them in. The
        other account keeps its own.
      </p>
      {others.length > 0 && (
        <ul aria-label="Other libraries on this device" className="grid gap-3">
          {others.map((library) => (
            <li
              key={library.account ?? 'device'}
              className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-card)] border border-rule bg-surface p-4"
            >
              <span>
                <span className="block font-semibold">{name(library)}</span>
                <span className="text-sm text-muted">{worksText(library.works)}</span>
              </span>
              <span className="flex flex-wrap gap-2">
                {library.works > 0 && (
                  <Button
                    type="button"
                    variant="outline"
                    disabled={busy}
                    onClick={() => {
                      setAsking(library);
                    }}
                  >
                    Bring its projects here
                  </Button>
                )}
                {library.signedIn && (
                  <Button
                    type="button"
                    variant="outline"
                    disabled={busy}
                    onClick={() => {
                      openLibrary(library.account);
                    }}
                  >
                    Switch to this account
                  </Button>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
      {adding ? (
        <div className="max-w-md">
          <SignInForm next="/account" onSession={(session) => enterAccount(session, '/account')} />
        </div>
      ) : (
        <div>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setAdding(true);
            }}
          >
            Sign in to another account
          </Button>
        </div>
      )}
      <Status text={message} />
      <AlertDialog
        open={asking !== null}
        onOpenChange={(open) => {
          if (!open) setAsking(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogTitle>Bring these projects into this account?</AlertDialogTitle>
          <AlertDialogDescription>
            {asking && `${worksText(asking.works)} of ${name(asking)} come here and sync with this account. `}
            The other library keeps its own. A project that this account has in another version comes in as a
            copy, so no words are lost.
          </AlertDialogDescription>
          <div className="flex flex-wrap justify-end gap-2">
            <AlertDialogCancel asChild>
              <Button variant="outline">Cancel</Button>
            </AlertDialogCancel>
            <AlertDialogAction asChild>
              <Button
                onClick={() => {
                  if (asking) void bring(asking);
                }}
              >
                Bring them in
              </Button>
            </AlertDialogAction>
          </div>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}

function SignedIn({ session }: { session: AccountSession }) {
  const [state, setState] = useState<AccountSyncState | null>(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState(false);
  // The link to the owner page shows only to an owner. The server checks again on that page.
  const [owner, setOwner] = useState(false);
  useEffect(() => {
    let live = true;
    isOwner().then(
      (yes) => {
        if (live) setOwner(yes);
      },
      () => undefined,
    );
    return () => {
      live = false;
    };
  }, []);

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
      // Each task ends by opening another library, so the page loads again.
      await task();
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
      {owner && (
        <div>
          <Button asChild>
            <Link to="/owner">Open the owner page</Link>
          </Button>
        </div>
      )}
      {state ? <SyncPanel state={state} onChange={load} /> : <Status text={message} />}
      <PasswordPanel email={session.email} />
      <LibrariesPanel />
      <section aria-labelledby="account-heading" className="grid gap-3 border-t border-rule pt-6">
        <h2 id="account-heading" className="font-display text-2xl font-semibold">
          Your account
        </h2>
        <p className="text-sm text-muted">
          Sign out on a device that is not yours. This device stops sync, and your projects stay hidden here
          until you sign in again.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() => {
              void act(async () => {
                // The session goes first, so no check between the steps finds a signed-in device with no
                // sync and joins again. The account's works stay hidden here until the next sign-in.
                await signOut();
                if (state?.kind === 'on') await stopAccountSyncHere();
                openLibrary(null);
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
            projects that it has now, with no account, and no device syncs. You cannot undo this.
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
                    await leaveDeletedAccount(session.userId);
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

  useEffect(() => {
    if (!returned.code) return;
    finishGoogle(returned.code)
      .then((signedIn) => enterAccount(signedIn, takeNext() ?? '/account'))
      .catch((error: unknown) => {
        setMessage(accountErrorText(error));
      });
  }, [returned.code]);

  let body: React.ReactNode;
  if (!accountsReady()) body = <p>Accounts are not set up in this build, so Vlo sends nothing.</p>;
  else if (session === undefined) body = null;
  else if (session) body = <SignedIn key={session.userId} session={session} />;
  else
    body = (
      <div className="grid max-w-md gap-4">
        <p>
          Sign in to keep your projects the same on your phone, your laptop and any other device. Vlo sends a
          6-digit code to your email. After you sign in, you can set a password on this page. Each account has
          its own projects.
        </p>
        <SignInForm next="/account" onSession={(signedIn) => enterAccount(signedIn, '/account')} />
      </div>
    );

  return (
    <div className="grid max-w-2xl gap-6">
      <h1 className="font-display text-4xl font-semibold">Account</h1>
      {body}
      <Status text={message} />
      <p className="text-sm text-muted">
        You do not need an account to write. Without one, your projects stay on this device.{' '}
        <Link to="/privacy" className="underline">
          What an account sends
        </Link>
      </p>
    </div>
  );
}
