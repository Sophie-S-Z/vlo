import { Camera } from 'lucide-react';
import { useId, useRef, useState, type ReactNode } from 'react';
import { MAX_IMAGE_INPUT } from '@/features/images/resize';
import { Button } from '@/ui/button';
import { cn } from '@/ui/cn';
import { Input } from '@/ui/input';
import { Label } from '@/ui/label';
import { Textarea } from '@/ui/textarea';
import { Avatar } from './Avatar';
import { PhotoCropper } from './PhotoCropper';
import { greetingName, LIMITS, profileProblem, type Profile } from './profile';
import { profileErrorText, saveProfile } from './profileServer';

/*
 * The profile form (ADR 0011). The name step after a first sign-in shows the photo, the name and the
 * name of the greeting. The profile page adds the pen name and the bio, and a preview of where each shows.
 */

function Field({
  label,
  hint,
  children,
}: {
  label: ReactNode;
  hint?: ReactNode;
  children: (ids: { id: string; hint?: string }) => ReactNode;
}) {
  const id = useId();
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children({ id, ...(hint ? { hint: `${id}-hint` } : {}) })}
      {hint && (
        <p id={`${id}-hint`} className="text-sm text-muted">
          {hint}
        </p>
      )}
    </div>
  );
}

export function ProfileForm({
  initial,
  full = false,
  submitLabel,
  onSaved,
  preview,
  footer,
}: {
  initial: Profile;
  /** True on the profile page: the pen name and the bio show too. */
  full?: boolean;
  submitLabel: string;
  onSaved?: (profile: Profile) => void;
  /** Shows where the profile appears, from the words in the form now. */
  preview?: (draft: Profile) => ReactNode;
  /** More controls under the form, such as "Not now". */
  footer?: ReactNode;
}) {
  const [draft, setDraft] = useState(initial);
  const [picked, setPicked] = useState<Blob | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [tried, setTried] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const set = (change: Partial<Profile>) => {
    setDraft((current) => ({ ...current, ...change }));
  };
  const problem = profileProblem(draft);
  const nameMissing = tried && draft.name.trim() === '';

  return (
    <form
      noValidate
      aria-label="Your profile"
      className={cn('grid gap-8', full && preview && 'lg:grid-cols-[minmax(0,1fr)_20rem] lg:gap-12')}
      onSubmit={(event) => {
        event.preventDefault();
        setTried(true);
        if (problem) {
          setMessage(problem);
          return;
        }
        setBusy(true);
        setMessage('');
        saveProfile(draft).then(
          (saved) => {
            setBusy(false);
            setDraft(saved);
            if (full)
              setMessage('Your profile is saved. Your other devices show it the next time Vlo opens.');
            onSaved?.(saved);
          },
          (error: unknown) => {
            setBusy(false);
            setMessage(profileErrorText(error));
          },
        );
      }}
    >
      <div className="grid content-start gap-6">
        <div className={cn('flex items-center gap-5', !full && 'flex-col')}>
          {/* The picture is a larger target for a pointer. A keyboard uses the button next to it. */}
          <button
            type="button"
            tabIndex={-1}
            aria-hidden="true"
            onClick={() => fileRef.current?.click()}
            className="group relative rounded-full"
          >
            <Avatar profile={draft} className={full ? 'size-24' : 'size-28'} />
            <span className="absolute right-0 bottom-0 grid size-9 place-items-center rounded-full border border-rule bg-surface text-text shadow-sm transition-transform duration-150 ease-out group-hover:scale-105">
              <Camera aria-hidden="true" strokeWidth={1.5} className="size-4" />
            </span>
          </button>
          <div className={cn('grid gap-1', !full && 'justify-items-center text-center')}>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                className="min-h-9"
                onClick={() => fileRef.current?.click()}
              >
                {draft.photo ? 'Change photo' : 'Add a photo'}
              </Button>
              {draft.photo && (
                <Button
                  type="button"
                  variant="ghost"
                  className="min-h-9"
                  onClick={() => {
                    set({ photo: null });
                  }}
                >
                  Remove photo
                </Button>
              )}
            </div>
            <p className="text-sm text-muted">
              {full ? 'Your photo shows on your devices where you sign in.' : 'A photo is optional.'}
            </p>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            tabIndex={-1}
            aria-hidden="true"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = '';
              if (!file) return;
              if (file.size > MAX_IMAGE_INPUT) setMessage('This image is larger than 50 MB.');
              else setPicked(file);
            }}
          />
        </div>

        <Field label="Your full name">
          {({ id }) => (
            <Input
              id={id}
              autoComplete="name"
              maxLength={LIMITS.name}
              required
              aria-invalid={nameMissing || undefined}
              value={draft.name}
              onChange={(event) => {
                set({ name: event.target.value });
              }}
            />
          )}
        </Field>
        <Field
          label={
            <>
              What Vlo calls you <span className="font-normal text-muted">(optional)</span>
            </>
          }
          hint="Vlo greets you with this name. With no name here, Vlo uses your first name."
        >
          {({ id, hint }) => (
            <Input
              id={id}
              autoComplete="nickname"
              maxLength={LIMITS.called}
              aria-describedby={hint}
              placeholder={greetingName({ name: draft.name, called: '' })}
              value={draft.called}
              onChange={(event) => {
                set({ called: event.target.value });
              }}
            />
          )}
        </Field>
        {full && (
          <>
            <Field
              label={
                <>
                  Pen name <span className="font-normal text-muted">(optional)</span>
                </>
              }
              hint="New projects take this name as their author, on the title page and in exports."
            >
              {({ id, hint }) => (
                <Input
                  id={id}
                  maxLength={LIMITS.penName}
                  aria-describedby={hint}
                  placeholder={draft.name.trim()}
                  value={draft.penName}
                  onChange={(event) => {
                    set({ penName: event.target.value });
                  }}
                />
              )}
            </Field>
            <Field
              label={
                <>
                  About you <span className="font-normal text-muted">(optional)</span>
                </>
              }
              hint={
                <span className="flex justify-between gap-4">
                  <span>A book can use this as its “About the author” page.</span>
                  <span className="tabular-nums">
                    {draft.bio.length.toLocaleString()} / {LIMITS.bio.toLocaleString()}
                  </span>
                </span>
              }
            >
              {({ id, hint }) => (
                <Textarea
                  id={id}
                  rows={5}
                  maxLength={LIMITS.bio}
                  aria-describedby={hint}
                  value={draft.bio}
                  onChange={(event) => {
                    set({ bio: event.target.value });
                  }}
                />
              )}
            </Field>
          </>
        )}

        <div className={cn('grid gap-3', full && 'sm:flex sm:flex-wrap sm:items-center')}>
          <Button
            type="submit"
            className={cn('min-h-12 text-base', full && 'sm:min-h-11 sm:text-sm')}
            disabled={busy}
          >
            {busy ? 'Saving…' : submitLabel}
          </Button>
          {footer}
        </div>
        <p role="status" className="text-sm empty:hidden">
          {message}
        </p>
      </div>
      {preview?.(draft)}
      {picked && (
        <PhotoCropper
          file={picked}
          onCancel={() => {
            setPicked(null);
          }}
          onDone={(photo) => {
            setPicked(null);
            set({ photo });
          }}
        />
      )}
    </form>
  );
}
