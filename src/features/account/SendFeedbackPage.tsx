import { useLiveQuery } from 'dexie-react-hooks';
import { useId, useState } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router';
import { useDocumentTitle } from '@/app/useDocumentTitle';
import { ShareError, sharingReady } from '@/features/share/rpc';
import { Button } from '@/ui/button';
import { Input } from '@/ui/input';
import { Label } from '@/ui/label';
import { RadioGroup, RadioGroupItem } from '@/ui/radio-group';
import { Textarea } from '@/ui/textarea';
import {
  FEEDBACK_KINDS,
  kindOf,
  MAX_FEEDBACK,
  placeOf,
  sendFeedback,
  type FeedbackKind,
} from './sendFeedback';
import { readSession } from './session';

/*
 * Send feedback (Phase 18, Task A4, decision A5): what a writer thinks of Vlo, or a personal note, goes to
 * Sophie, who makes Vlo. Only what the writer types goes, with the kind of device and the app version. The
 * server refuses spam (migration 0012).
 */

const STARS = [1, 2, 3, 4, 5] as const;

/** The writer's text for feedback that did not go. */
export function feedbackErrorText(error: unknown): string {
  const kind = error instanceof ShareError ? error.kind : 'server';
  if (kind === 'offline') return 'Vlo could not reach the server. Check the connection, then try again.';
  if (kind === 'limit') return 'You sent 10 messages today. Thank you! Send more tomorrow.';
  if (kind === 'too-large') return 'This message is too long. Keep it under 4,000 characters.';
  if (kind === 'busy') return 'The server is at its limit for today. Try again tomorrow.';
  if (kind === 'too-fast') return 'You sent a message a moment ago. Wait 30 seconds, then send this one.';
  if (kind === 'duplicate') return 'You sent this message already today. Sophie has it.';
  if (kind === 'blocked') return 'Vlo cannot send messages from this device or account.';
  return 'The server refused the feedback. Try again later.';
}

/** Each visit starts a new form, also from the page itself, such as a link to a note after Thank you. */
export function SendFeedbackPage() {
  const { key } = useLocation();
  return <FeedbackForm key={key} />;
}

function FeedbackForm() {
  useDocumentTitle('Send feedback');
  const id = useId();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from ?? '';
  const [params] = useSearchParams();
  const session = useLiveQuery(readSession);
  const [kind, setKind] = useState<FeedbackKind>(() => kindOf(params.get('kind')));
  const [message, setMessage] = useState('');
  const [rating, setRating] = useState<number | null>(null);
  const [contact, setContact] = useState('');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [sent, setSent] = useState(false);

  if (!sharingReady())
    return (
      <div className="grid max-w-2xl gap-4">
        <h1 className="font-display text-4xl font-semibold">Send feedback</h1>
        <p>Feedback is not set up in this build, so Vlo sends nothing.</p>
        <p>
          <a href="https://github.com/Sophie-S-Z/vlo/issues" rel="noreferrer" className="underline">
            Write to us on GitHub
          </a>
        </p>
      </div>
    );

  if (sent)
    return (
      <div className="grid max-w-2xl gap-4">
        <h1 className="font-display text-4xl font-semibold">Thank you</h1>
        <p role="status">Your message went to Sophie, who makes Vlo. Sophie reads each message.</p>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setSent(false);
              setMessage('');
              setRating(null);
              setStatus('');
            }}
          >
            Send more feedback
          </Button>
          <Button asChild variant="ghost">
            <Link to="/">Go to the Library</Link>
          </Button>
        </div>
      </div>
    );

  const left = MAX_FEEDBACK - message.length;
  return (
    <div className="grid max-w-2xl gap-6">
      <h1 className="font-display text-4xl font-semibold">Send feedback</h1>
      <p>
        Tell Sophie, who makes Vlo, what works, what does not, and what you want next. You can also send a
        personal note. Only what you type here goes, with the kind of device and the version of Vlo. No text
        of your projects goes. You can send up to 10 messages in a day.
      </p>
      <form
        className="grid gap-5"
        onSubmit={(event) => {
          event.preventDefault();
          if (message.trim() === '') {
            setStatus('Type your message first.');
            return;
          }
          setBusy(true);
          setStatus('');
          sendFeedback({ kind, message, rating, contact, place: placeOf(from) }).then(
            () => {
              setSent(true);
              setBusy(false);
            },
            (error: unknown) => {
              setStatus(feedbackErrorText(error));
              setBusy(false);
            },
          );
        }}
      >
        <fieldset className="grid gap-2">
          <legend className="mb-2 font-semibold">What is it about?</legend>
          <RadioGroup
            value={kind}
            onValueChange={(value) => {
              setKind(value as FeedbackKind);
            }}
          >
            {FEEDBACK_KINDS.map((k) => (
              <div key={k.value} className="flex items-center gap-2">
                <RadioGroupItem id={`${id}-${k.value}`} value={k.value} />
                <Label htmlFor={`${id}-${k.value}`}>{k.label}</Label>
              </div>
            ))}
          </RadioGroup>
        </fieldset>
        <div className="grid gap-1.5">
          <Label htmlFor={`${id}-message`}>{kind === 'note' ? 'Your note' : 'Your feedback'}</Label>
          <Textarea
            id={`${id}-message`}
            rows={7}
            maxLength={MAX_FEEDBACK}
            aria-describedby={`${id}-left`}
            value={message}
            onChange={(event) => {
              setMessage(event.target.value);
            }}
          />
          <p id={`${id}-left`} className="text-sm text-muted">
            {left < 500 ? `${String(left)} characters left.` : 'Up to 4,000 characters.'}
          </p>
        </div>
        <fieldset className="grid gap-2">
          <legend className="mb-2 font-semibold">How do you like Vlo? (you can skip this)</legend>
          <div className="flex flex-wrap gap-2">
            {STARS.map((n) => (
              <Button
                key={n}
                type="button"
                variant={rating === n ? 'primary' : 'outline'}
                aria-pressed={rating === n}
                aria-label={`${String(n)} of 5`}
                onClick={() => {
                  setRating(rating === n ? null : n);
                }}
              >
                {n}
              </Button>
            ))}
          </div>
          <p className="text-sm text-muted">1 is poor, and 5 is very good.</p>
        </fieldset>
        {session ? (
          <p className="text-sm text-muted">
            You are signed in, so your message goes with your account ({session.email}). Sophie can reply to
            that address.
          </p>
        ) : (
          <div className="grid max-w-sm gap-1.5">
            <Label htmlFor={`${id}-contact`}>Email for a reply (you can skip this)</Label>
            <Input
              id={`${id}-contact`}
              type="email"
              autoComplete="email"
              maxLength={200}
              value={contact}
              onChange={(event) => {
                setContact(event.target.value);
              }}
            />
          </div>
        )}
        <div>
          <Button type="submit" disabled={busy}>
            {kind === 'note' ? 'Send the note' : 'Send feedback'}
          </Button>
        </div>
        <p role="status" className="text-sm">
          {status}
        </p>
      </form>
    </div>
  );
}
