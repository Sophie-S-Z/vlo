import { useLiveQuery } from 'dexie-react-hooks';
import { useCallback, useEffect, useRef, useState } from 'react';
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
import { openLibrary } from '@/lib/library';
import {
  accountSyncState,
  AUTOMATIC,
  joinAccountSync,
  startAccountSync,
  stopAccountSyncHere,
  type AccountSyncState,
} from './accountSync';
import { accountsReady, AuthError, deleteAccount, finishGoogle, signOut } from './auth';
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
        else await startAccountSync(name);
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
          6-digit code to your email. You need no password. Each account has its own projects.
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
