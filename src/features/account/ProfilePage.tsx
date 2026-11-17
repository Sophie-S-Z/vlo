import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { useDocumentTitle } from '@/app/useDocumentTitle';
import { Button } from '@/ui/button';
import { byline, greetingName, readProfile, type Profile } from './profile';
import { ProfileForm } from './ProfileForm';
import { refreshProfile } from './profileServer';
import { readSession, type AccountSession } from './session';

/*
 * The profile page (ADR 0011): the photo, the name, the name of the greeting, the pen name and the bio. The
 * preview shows where each one appears, from the words in the form as the writer types.
 */

const CAPTION = 'text-xs font-medium tracking-[0.14em] text-muted uppercase';

function Preview({ draft }: { draft: Profile }) {
  const name = greetingName(draft);
  return (
    <aside aria-label="Where your profile shows" className="grid content-start gap-4 lg:sticky lg:top-6">
      <figure className="grid gap-3 rounded-[var(--radius-card)] border border-rule bg-surface px-5 py-6 text-center">
        <figcaption className={CAPTION}>Your library</figcaption>
        <p className="font-manuscript text-2xl leading-tight font-light text-balance italic">
          Welcome back to your library{name ? `, ${name}` : ''}
        </p>
      </figure>
      <figure className="grid gap-4 rounded-[var(--radius-card)] border border-rule bg-surface px-5 py-6">
        <figcaption className={`${CAPTION} text-center`}>A new title page</figcaption>
        <div className="mx-auto grid aspect-[5/7] w-36 content-center justify-items-center gap-2 bg-bg px-3 text-center shadow-[0_1px_2px_oklch(0_0_0/0.12),0_8px_24px_-12px_oklch(0_0_0/0.35)]">
          <p className="font-display text-lg leading-tight">Your next book</p>
          <div aria-hidden="true" className="h-px w-8 bg-rule" />
          <p className="text-xs [overflow-wrap:anywhere] text-muted italic">{byline(draft) || 'Your name'}</p>
        </div>
      </figure>
      {draft.bio.trim() && (
        <figure className="grid gap-2 rounded-[var(--radius-card)] border border-rule bg-surface px-5 py-6">
          <figcaption className={CAPTION}>About the author</figcaption>
          <p className="line-clamp-6 font-manuscript text-base whitespace-pre-line [overflow-wrap:anywhere]">
            {draft.bio.trim()}
          </p>
        </figure>
      )}
    </aside>
  );
}

export function ProfilePage() {
  useDocumentTitle('Your profile');
  const [session, setSession] = useState<AccountSession | null | undefined>(undefined);
  // The server's profile fills the form. With no answer, the copy on this device does.
  const [initial, setInitial] = useState<Profile | null>(null);

  useEffect(() => {
    const ended = new AbortController();
    // A call, so TypeScript reads the flag again after each wait.
    const stopped = () => ended.signal.aborted;
    void (async () => {
      const found = await readSession().catch(() => null);
      if (stopped()) return;
      setSession(found);
      if (!found) return;
      const profile = await refreshProfile().catch(() => readProfile().catch(() => null));
      if (!stopped())
        setInitial(profile ?? { name: found.name ?? '', called: '', penName: '', bio: '', photo: null });
    })();
    return () => {
      ended.abort();
    };
  }, []);

  let body: React.ReactNode = null;
  if (session === null)
    body = (
      <div className="grid justify-items-start gap-4">
        <p>Sign in to make your profile. Your name and photo then go with you to each device.</p>
        <Button asChild>
          <Link to="/sign-in?next=%2Fprofile">Sign in</Link>
        </Button>
      </div>
    );
  else if (session && initial)
    body = (
      <ProfileForm
        initial={initial}
        full
        submitLabel="Save profile"
        preview={(draft) => <Preview draft={draft} />}
      />
    );

  return (
    <div className="grid gap-8">
      <header className="grid gap-2">
        <h1 className="font-display text-4xl font-semibold">Your profile</h1>
        <p className="text-muted">
          {session?.email ? (
            <>
              Signed in as <span className="text-text">{session.email}</span>.{' '}
            </>
          ) : null}
          <Link to="/account" className="underline underline-offset-4">
            Account and sync
          </Link>
        </p>
      </header>
      {body}
    </div>
  );
}
