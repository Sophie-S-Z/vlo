import { MessageSquare } from 'lucide-react';
import { useCallback, useEffect, useId, useRef, useState, type ReactNode, type SyntheticEvent } from 'react';
import { useParams } from 'react-router';
import { useDocumentTitle } from '@/app/useDocumentTitle';
import { blockQuote, parseBundle, type ShareBlock, type ShareBundle } from '@/features/share/bundle';
import {
  MAX_COMMENT,
  MAX_NAME,
  readComments,
  sendComment,
  type ListedComment,
  type ReaderComment,
} from '@/features/share/comments';
import { rpc, ShareError } from '@/features/share/rpc';
import { clock } from '@/lib/clock';
import { CryptoError, importShareKey, openJson } from '@/lib/crypto';
import { Button } from '@/ui/button';
import { Input } from '@/ui/input';
import { Label } from '@/ui/label';
import { Textarea } from '@/ui/textarea';
import { Block, NoteText, notesOf, TopHeading, topHeading } from './ReaderText';

/*
 * The reader view of a share link (spec section 11, plan Task E4). It runs outside the app shell: it reads
 * no project, loads no editor and no AI code, and needs no account. The key comes from the link fragment
 * once, and the address bar loses the fragment at once, so a screenshot or a copied address holds no key.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The key taken from the fragment, kept for this page's address only. */
let taken: { path: string; key: string } | null = null;

/** Reads `#k=` from the address, then removes the fragment from the address bar and the history entry. */
function takeKey(): string {
  const { pathname, search, hash } = window.location;
  if (hash !== '') {
    const key = new URLSearchParams(hash.slice(1)).get('k');
    if (key) taken = { path: pathname, key };
    window.history.replaceState(window.history.state, '', `${pathname}${search}`);
  }
  return taken?.path === pathname ? taken.key : '';
}

type State =
  | { kind: 'loading' }
  | { kind: 'no-key' }
  | { kind: 'bad-key' }
  | { kind: 'missing' }
  | { kind: 'expired'; at: number }
  | { kind: 'revoked' }
  | { kind: 'unreadable' }
  | { kind: 'failed'; message: string }
  | { kind: 'ready'; bundle: ShareBundle; key: CryptoKey; expiresAt: number };

interface ShareRow {
  payload: unknown;
  iv: unknown;
  expires_at: unknown;
  status: unknown;
}

const date = new Intl.DateTimeFormat(undefined, { dateStyle: 'long' });
const when = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });

async function load(shareId: string, keyText: string): Promise<State> {
  if (keyText === '') return { kind: 'no-key' };
  if (!UUID.test(shareId)) return { kind: 'missing' };
  let key: CryptoKey;
  try {
    key = await importShareKey(keyText);
  } catch {
    return { kind: 'bad-key' };
  }
  const rows = await rpc<unknown>('get_share', { p_id: shareId }, 'share');
  const row = (Array.isArray(rows) ? rows[0] : null) as ShareRow | null | undefined;
  if (!row || typeof row !== 'object') return { kind: 'missing' };
  const expiresAt = typeof row.expires_at === 'string' ? Date.parse(row.expires_at) : NaN;
  if (row.status === 'revoked') return { kind: 'revoked' };
  if (row.status === 'expired') return { kind: 'expired', at: expiresAt };
  if (row.status !== 'ok' || typeof row.payload !== 'string' || typeof row.iv !== 'string')
    return { kind: 'unreadable' };
  let value: unknown;
  try {
    value = await openJson({ payload: row.payload, iv: row.iv }, key);
  } catch (problem) {
    if (problem instanceof CryptoError) return { kind: 'unreadable' };
    throw problem;
  }
  const bundle = parseBundle(value);
  return bundle ? { kind: 'ready', bundle, key, expiresAt } : { kind: 'unreadable' };
}

function Notice({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <section className="grid gap-3">
      <h1 className="font-display text-3xl font-semibold">{title}</h1>
      {children}
    </section>
  );
}

interface CommentFormProps {
  quote: string;
  name: string;
  onName: (name: string) => void;
  onSend: (text: string) => Promise<void>;
  onCancel: () => void;
}

function CommentForm({ quote, name, onName, onSend, onCancel }: CommentFormProps) {
  const ids = useId();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    textRef.current?.focus();
  }, []);

  async function submit(event: SyntheticEvent) {
    event.preventDefault();
    if (text.trim() === '') {
      setError('Type a comment first.');
      textRef.current?.focus();
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onSend(text.trim());
    } catch (problem) {
      // The typed text stays, so the reader can send it again (Review Focus 4).
      setError(
        problem instanceof ShareError ? problem.message : 'Vlo could not send the comment. Try again.',
      );
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={(event) => {
        void submit(event);
      }}
      className="grid gap-3 rounded-[var(--radius-card)] border border-rule bg-surface p-4 font-ui text-base"
    >
      <div className="grid gap-1.5">
        <Label htmlFor={`${ids}-text`}>Your comment on “{quote}”</Label>
        <Textarea
          ref={textRef}
          id={`${ids}-text`}
          value={text}
          rows={3}
          maxLength={MAX_COMMENT}
          aria-invalid={error !== null || undefined}
          aria-describedby={error !== null ? `${ids}-error` : undefined}
          onChange={(event) => {
            setText(event.target.value);
          }}
        />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor={`${ids}-name`}>Your name (optional)</Label>
        <Input
          id={`${ids}-name`}
          value={name}
          maxLength={MAX_NAME}
          autoComplete="name"
          onChange={(event) => {
            onName(event.target.value);
          }}
        />
      </div>
      {error !== null && (
        <p id={`${ids}-error`} role="alert" className="text-sm text-accent-text">
          {error}
        </p>
      )}
      <div className="flex flex-wrap justify-end gap-2">
        <Button type="button" variant="ghost" disabled={busy} onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={busy}>
          {busy ? 'Sending' : 'Send comment'}
        </Button>
      </div>
    </form>
  );
}

function CommentList({ comments }: { comments: readonly ListedComment[] }) {
  if (comments.length === 0) return null;
  return (
    <ul aria-label="Comments" className="grid gap-2 font-ui text-sm">
      {comments.map(({ id, comment, at }) => (
        <li key={id} className="grid gap-1 rounded-[var(--radius-card)] bg-surface px-4 py-3">
          <span className="text-muted">
            <span className="font-medium text-text [overflow-wrap:anywhere]">
              {comment.name ?? 'A reader'}
            </span>
            {', '}
            {when.format(at)}
          </span>
          <span className="whitespace-pre-wrap [overflow-wrap:anywhere]">{comment.text}</span>
        </li>
      ))}
    </ul>
  );
}

interface ReaderBlockProps {
  block: ShareBlock;
  quote: string;
  comments: readonly ListedComment[];
  open: boolean;
  onOpen: () => void;
  form: ReactNode;
}

function ReaderBlock({ block, quote, comments, open, onOpen, form }: ReaderBlockProps) {
  const label = quote === '' ? 'Comment here' : `Comment on “${quote}”`;
  return (
    <div className="grid gap-3">
      {/*
       * A tap or click on the text opens the comment form, as a shortcut. The button beside the block is the
       * same action for a keyboard and a screen reader.
       */}
      <div
        role="presentation"
        className="group relative cursor-text"
        onClick={(event) => {
          const target = event.target as HTMLElement;
          if (target.closest('a, button')) return;
          if ((window.getSelection()?.toString() ?? '') !== '') return;
          onOpen();
        }}
      >
        <Block block={block} />
        <button
          type="button"
          aria-label={label}
          aria-expanded={open}
          onClick={onOpen}
          className={`inline-flex size-10 items-center justify-center gap-1 rounded-md font-ui text-xs text-muted hover:bg-surface hover:text-text focus-visible:opacity-100 max-sm:sr-only max-sm:focus:not-sr-only sm:absolute sm:top-0 sm:-right-14 ${comments.length > 0 || open ? 'sm:opacity-100' : 'sm:opacity-0 sm:group-hover:opacity-100'}`}
        >
          <MessageSquare aria-hidden="true" className="size-4" />
          {comments.length > 0 && <span aria-hidden="true">{comments.length}</span>}
        </button>
      </div>
      <CommentList comments={comments} />
      {open && form}
    </div>
  );
}

function ReaderBody({
  shareId,
  bundle,
  keyValue,
  expiresAt,
}: {
  shareId: string;
  bundle: ShareBundle;
  keyValue: CryptoKey;
  expiresAt: number;
}) {
  const [comments, setComments] = useState<ListedComment[]>([]);
  const [commentsFailed, setCommentsFailed] = useState(false);
  const [openAt, setOpenAt] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [sent, setSent] = useState('');
  const notes = bundle.sections.flatMap((s) => notesOf(s.blocks));
  const top = topHeading(bundle.sections.flatMap((s) => s.blocks));

  useEffect(() => {
    let live = true;
    readComments(shareId, keyValue).then(
      (list) => {
        if (live) setComments(list);
      },
      () => {
        if (live) setCommentsFailed(true);
      },
    );
    return () => {
      live = false;
    };
  }, [shareId, keyValue]);

  async function send(section: number, block: number, quote: string, text: string) {
    const comment: ReaderComment = {
      v: 1,
      section,
      block,
      quote,
      ...(name.trim() !== '' ? { name: name.trim() } : {}),
      text,
      at: clock.now(),
    };
    const id = await sendComment(shareId, keyValue, comment);
    setComments((list) => [...list, { id: id || `local-${String(comment.at)}`, comment, at: comment.at }]);
    setOpenAt(null);
    setSent('Comment sent.');
  }

  return (
    <TopHeading.Provider value={top}>
      <article className="grid gap-10">
        <header className="grid gap-3 font-ui">
          <h1 className="font-display text-4xl font-semibold [overflow-wrap:anywhere] sm:text-5xl">
            {bundle.title}
          </h1>
          {bundle.author !== undefined && <p className="text-lg [overflow-wrap:anywhere]">{bundle.author}</p>}
          <p className="text-sm text-muted">
            Shared for reading until {date.format(expiresAt)}. To comment, tap or click a paragraph. The
            writer and anyone with this link can read the comments.
          </p>
          {commentsFailed && (
            <p role="alert" className="text-sm text-accent-text">
              Vlo could not load the comments. Reload the page to try again.
            </p>
          )}
          <p role="status" className="sr-only">
            {sent}
          </p>
        </header>
        {bundle.sections.map((section, s) => (
          <section key={s} aria-label={section.title || undefined} className="grid gap-5">
            {section.blocks.map((block, b) => {
              const quote = blockQuote(block);
              const place = `${String(s)}:${String(b)}`;
              return (
                <ReaderBlock
                  key={b}
                  block={block}
                  quote={quote}
                  comments={comments.filter((c) => c.comment.section === s && c.comment.block === b)}
                  open={openAt === place}
                  onOpen={() => {
                    setSent('');
                    setOpenAt(place);
                  }}
                  form={
                    <CommentForm
                      quote={quote === '' ? 'this part' : quote}
                      name={name}
                      onName={setName}
                      onSend={(text) => send(s, b, quote, text)}
                      onCancel={() => {
                        setOpenAt(null);
                      }}
                    />
                  }
                />
              );
            })}
          </section>
        ))}
        {notes.length > 0 && (
          <section aria-labelledby="reader-notes" className="grid gap-3 border-t border-rule pt-6 text-base">
            <h2 id="reader-notes" className="font-display text-2xl font-semibold">
              Notes
            </h2>
            <ol className="grid list-decimal gap-2 pl-6">
              {notes.map(({ fn, note }) => (
                <li key={fn} id={`note-${String(fn)}`} value={fn}>
                  <NoteText note={note} />{' '}
                  <a href={`#note-ref-${String(fn)}`} aria-label={`Back to note ${String(fn)} in the text`}>
                    ↩
                  </a>
                </li>
              ))}
            </ol>
          </section>
        )}
      </article>
    </TopHeading.Provider>
  );
}

export function ReaderPage() {
  const { shareId = '' } = useParams();
  const [keyText] = useState(takeKey);
  const [state, setState] = useState<State>({ kind: 'loading' });
  const [attempt, setAttempt] = useState(0);

  const title = state.kind === 'ready' ? state.bundle.title : 'Shared text';
  useDocumentTitle(title);

  const retry = useCallback(() => {
    setState({ kind: 'loading' });
    setAttempt((n) => n + 1);
  }, []);

  useEffect(() => {
    let live = true;
    load(shareId, keyText).then(
      (next) => {
        if (live) setState(next);
      },
      (problem: unknown) => {
        if (!live) return;
        setState({
          kind: 'failed',
          message: problem instanceof ShareError ? problem.message : 'Vlo could not open this link.',
        });
      },
    );
    return () => {
      live = false;
    };
  }, [shareId, keyText, attempt]);

  return (
    <div className="min-h-dvh bg-bg text-text">
      <main className="mx-auto grid w-full max-w-[42rem] gap-8 px-4 py-10 font-manuscript text-lg leading-relaxed sm:px-6 sm:py-16">
        <p className="font-display text-xl font-semibold" aria-hidden="true">
          Vlo
        </p>
        {state.kind === 'loading' && (
          <p role="status" className="font-ui text-base text-muted">
            Opening the text.
          </p>
        )}
        {state.kind === 'no-key' && (
          <Notice title="This link is missing its key">
            <p>Ask the writer for the whole link. The key is the part after #k=.</p>
          </Notice>
        )}
        {state.kind === 'bad-key' && (
          <Notice title="This link has a damaged key">
            <p>Ask the writer for the whole link.</p>
          </Notice>
        )}
        {state.kind === 'missing' && (
          <Notice title="This link does not exist">
            <p>Check that you have the whole link, or ask the writer for a new one.</p>
          </Notice>
        )}
        {state.kind === 'expired' && (
          <Notice title="This link expired">
            <p>
              {Number.isFinite(state.at)
                ? `This link expired on ${date.format(state.at)}.`
                : 'This link expired.'}{' '}
              Ask the writer for a new link.
            </p>
          </Notice>
        )}
        {state.kind === 'revoked' && (
          <Notice title="The writer stopped sharing this link">
            <p>Ask the writer for a new link.</p>
          </Notice>
        )}
        {state.kind === 'unreadable' && (
          <Notice title="Vlo cannot read this text">
            <p>This link holds text that Vlo cannot read. Ask the writer for the whole link, or a new one.</p>
          </Notice>
        )}
        {state.kind === 'failed' && (
          <Notice title="Vlo could not open this link">
            <p role="alert">{state.message}</p>
            <div>
              <Button type="button" onClick={retry}>
                Try again
              </Button>
            </div>
          </Notice>
        )}
        {state.kind === 'ready' && (
          <ReaderBody
            shareId={shareId.toLowerCase()}
            bundle={state.bundle}
            keyValue={state.key}
            expiresAt={state.expiresAt}
          />
        )}
      </main>
    </div>
  );
}
