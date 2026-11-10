import { MessageSquare } from 'lucide-react';
import {
  memo,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type SyntheticEvent,
} from 'react';
import { useParams } from 'react-router';
import { useDocumentTitle } from '@/app/useDocumentTitle';
import {
  blockQuote,
  parseBundle,
  textOfBlock,
  type ShareBlock,
  type ShareBundle,
} from '@/features/share/bundle';
import {
  MAX_COMMENT,
  MAX_NAME,
  REACTION_LABELS,
  REACTIONS,
  readComments,
  sendComment,
  type ListedComment,
  type Reaction,
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
import { pickedWords, type Picked, type PickedWords } from './selection';

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
    value = await openJson({ payload: row.payload, iv: row.iv }, key, 'bundle');
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
  onSend: (text: string, reaction: Reaction | null) => Promise<void>;
  onCancel: () => void;
}

function CommentForm({ quote, name, onName, onSend, onCancel }: CommentFormProps) {
  const ids = useId();
  const [text, setText] = useState('');
  const [reaction, setReaction] = useState<Reaction | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    textRef.current?.focus();
  }, []);

  async function submit(event: SyntheticEvent) {
    event.preventDefault();
    if (text.trim() === '' && reaction === null) {
      setError('Pick a reaction or type a comment first.');
      textRef.current?.focus();
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onSend(text.trim(), reaction);
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
        <Label htmlFor={`${ids}-text`} className="[overflow-wrap:anywhere]">
          Your comment on “{quote}”
        </Label>
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
      <fieldset className="grid gap-2">
        <legend className="mb-1.5 text-sm font-medium">Your reaction (optional)</legend>
        <div className="flex flex-wrap gap-2">
          {REACTIONS.map((r) => (
            <button
              key={r}
              type="button"
              aria-pressed={reaction === r}
              onClick={() => {
                setReaction(reaction === r ? null : r);
              }}
              className="min-h-11 rounded-full border border-rule px-4 text-sm hover:border-muted aria-pressed:border-accent aria-pressed:bg-accent aria-pressed:text-on-accent"
            >
              {REACTION_LABELS[r]}
            </button>
          ))}
        </div>
      </fieldset>
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

function CommentList({
  comments,
  label = 'Comments',
}: {
  comments: readonly ListedComment[];
  label?: string;
}) {
  if (comments.length === 0) return null;
  return (
    <ul aria-label={label} className="grid gap-2 font-ui text-sm">
      {comments.map(({ id, comment, at }) => (
        <li key={id} className="grid gap-1 rounded-[var(--radius-card)] bg-surface px-4 py-3">
          <span className="text-muted">
            <span className="font-medium text-text [overflow-wrap:anywhere]">
              {comment.name ?? 'A reader'}
            </span>
            {', '}
            {when.format(at)}
          </span>
          {comment.start !== undefined && (
            <span className="text-muted italic [overflow-wrap:anywhere]">On “{comment.quote}”</span>
          )}
          {comment.reaction && <span className="font-medium">{REACTION_LABELS[comment.reaction]}</span>}
          {comment.text !== '' && (
            <span className="whitespace-pre-wrap [overflow-wrap:anywhere]">{comment.text}</span>
          )}
        </li>
      ))}
    </ul>
  );
}

function AnswerForm({ question, onSend }: { question: string; onSend: (text: string) => Promise<void> }) {
  const id = useId();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: SyntheticEvent) {
    event.preventDefault();
    if (text.trim() === '') {
      setError('Type an answer first.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onSend(text.trim());
      setText('');
    } catch (problem) {
      // The typed answer stays, so the reader can send it again.
      setError(problem instanceof ShareError ? problem.message : 'Vlo could not send the answer. Try again.');
    }
    setBusy(false);
  }

  return (
    <form
      onSubmit={(event) => {
        void submit(event);
      }}
      className="grid gap-2"
    >
      <Label htmlFor={id} className="text-base [overflow-wrap:anywhere]">
        {question}
      </Label>
      <Textarea
        id={id}
        value={text}
        rows={3}
        maxLength={MAX_COMMENT}
        aria-invalid={error !== null || undefined}
        aria-describedby={error !== null ? `${id}-error` : undefined}
        onChange={(event) => {
          setText(event.target.value);
        }}
      />
      {error !== null && (
        <p id={`${id}-error`} role="alert" className="text-sm text-accent-text">
          {error}
        </p>
      )}
      <div className="flex justify-end">
        <Button type="submit" disabled={busy}>
          {busy ? 'Sending' : 'Send answer'}
        </Button>
      </div>
    </form>
  );
}

interface ReaderBlockProps {
  block: ShareBlock;
  /** The place of the block, such as "0:3": its section and its index there. */
  place: string;
  quote: string;
  comments: readonly ListedComment[];
  open: boolean;
  onOpen: (place: string) => void;
  /** The comment form, for the open block only. */
  form: ReactNode;
}

/**
 * One block with its comments. It renders again only when its own props change, so typing a comment
 * does not render the whole text again.
 */
const ReaderBlock = memo(function ReaderBlock({
  block,
  place,
  quote,
  comments,
  open,
  onOpen,
  form,
}: ReaderBlockProps) {
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
          onOpen(place);
        }}
      >
        <div data-place={place}>
          <Block block={block} />
        </div>
        <button
          type="button"
          aria-label={label}
          aria-expanded={open}
          onClick={() => {
            onOpen(place);
          }}
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
});

const NO_COMMENTS: readonly ListedComment[] = [];
const NO_QUESTIONS: readonly string[] = [];

/** The first words of a quote, for a button label. */
const shortQuote = (quote: string) => (quote.length > 60 ? `${quote.slice(0, 59).trimEnd()}…` : quote);

type Sending = Pick<ReaderComment, 'section' | 'block' | 'quote' | 'text'> &
  Partial<Pick<ReaderComment, 'start' | 'end' | 'reaction' | 'question'>>;

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
  const ids = useId();
  const [comments, setComments] = useState<ListedComment[]>([]);
  const [commentsFailed, setCommentsFailed] = useState(false);
  /** The block whose comment form is open, and the selected words that the comment is on. */
  const [openAt, setOpenAt] = useState<{ place: string; words: PickedWords | null } | null>(null);
  const [picked, setPicked] = useState<Picked | null>(null);
  const [name, setName] = useState('');
  const [sent, setSent] = useState('');
  const notes = useMemo(() => bundle.sections.flatMap((s) => notesOf(s.blocks)), [bundle]);
  const top = useMemo(() => topHeading(bundle.sections.flatMap((s) => s.blocks)), [bundle]);
  const quotes = useMemo(() => bundle.sections.map((s) => s.blocks.map(blockQuote)), [bundle]);
  const texts = useMemo(() => bundle.sections.map((s) => s.blocks.map(textOfBlock)), [bundle]);
  const questions = bundle.questions ?? NO_QUESTIONS;
  const byPlace = useMemo(() => {
    const map = new Map<string, ListedComment[]>();
    for (const c of comments) {
      if (c.comment.question !== undefined) continue;
      const place = `${String(c.comment.section)}:${String(c.comment.block)}`;
      map.set(place, [...(map.get(place) ?? []), c]);
    }
    return map;
  }, [comments]);
  const answers = useMemo(
    () => questions.map((_, q) => comments.filter((c) => c.comment.question === q)),
    [comments, questions],
  );
  const onOpen = useCallback((place: string) => {
    setSent('');
    setOpenAt({ place, words: null });
  }, []);

  // The words that the reader selects in one block. A press on the comment button keeps them, because on
  // a phone the press can clear the selection before the button gets the click.
  const pressing = useRef(false);
  useEffect(() => {
    const textAt = (place: string) => {
      const [s, b] = place.split(':').map(Number);
      return texts[s ?? -1]?.[b ?? -1];
    };
    const onChange = () => {
      const next = pickedWords(document.getSelection(), textAt);
      if (!next && pressing.current) return;
      setPicked((was) =>
        was?.place === next?.place && was?.start === next?.start && was?.end === next?.end ? was : next,
      );
    };
    document.addEventListener('selectionchange', onChange);
    return () => {
      document.removeEventListener('selectionchange', onChange);
    };
  }, [texts]);

  useEffect(() => {
    let live = true;
    readComments(shareId, keyValue, { questions: questions.length, blocks: texts }).then(
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
  }, [shareId, keyValue, questions.length, texts]);

  async function send(fields: Sending, done: string) {
    const comment: ReaderComment = {
      v: 2,
      ...fields,
      ...(name.trim() !== '' ? { name: name.trim() } : {}),
      at: clock.now(),
    };
    const id = await sendComment(shareId, keyValue, comment);
    setComments((list) => [...list, { id: id || `local-${String(comment.at)}`, comment, at: comment.at }]);
    setSent(done);
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
            Shared for reading until {date.format(expiresAt)}. To comment or react, tap or click a paragraph,
            or select some words. The writer and anyone with this link can read the comments.
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
              const quote = quotes[s]?.[b] ?? '';
              const place = `${String(s)}:${String(b)}`;
              const open = openAt?.place === place;
              const words = open ? openAt.words : null;
              return (
                <ReaderBlock
                  key={b}
                  block={block}
                  place={place}
                  quote={quote}
                  comments={byPlace.get(place) ?? NO_COMMENTS}
                  open={open}
                  onOpen={onOpen}
                  form={
                    open && (
                      <CommentForm
                        quote={words?.quote ?? (quote === '' ? 'this part' : quote)}
                        name={name}
                        onName={setName}
                        onSend={async (text, reaction) => {
                          await send(
                            {
                              section: s,
                              block: b,
                              quote: words?.quote ?? quote,
                              ...(words ? { start: words.start, end: words.end } : {}),
                              ...(reaction ? { reaction } : {}),
                              text,
                            },
                            'Comment sent.',
                          );
                          setOpenAt(null);
                          setPicked(null);
                        }}
                        onCancel={() => {
                          setOpenAt(null);
                        }}
                      />
                    )
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
                  <a
                    href={`#note-ref-${String(fn)}`}
                    className="underline"
                    aria-label={`Back to note ${String(fn)} in the text`}
                  >
                    ↩
                  </a>
                </li>
              ))}
            </ol>
          </section>
        )}
        {questions.length > 0 && (
          <section
            aria-labelledby={`${ids}-questions`}
            className="grid gap-5 border-t border-rule pt-6 font-ui text-base"
          >
            <h2 id={`${ids}-questions`} className="font-display text-2xl font-semibold">
              Questions from the writer
            </h2>
            <div className="grid max-w-sm gap-1.5">
              <Label htmlFor={`${ids}-name`}>Your name (optional)</Label>
              <Input
                id={`${ids}-name`}
                value={name}
                maxLength={MAX_NAME}
                autoComplete="name"
                onChange={(event) => {
                  setName(event.target.value);
                }}
              />
            </div>
            <ol className="grid gap-6">
              {questions.map((question, q) => (
                <li key={q} className="grid gap-3">
                  <AnswerForm
                    question={question}
                    onSend={(text) =>
                      send({ section: 0, block: 0, quote: '', question: q, text }, 'Answer sent.')
                    }
                  />
                  <CommentList
                    comments={answers[q] ?? NO_COMMENTS}
                    label={`Answers to question ${String(q + 1)}`}
                  />
                </li>
              ))}
            </ol>
          </section>
        )}
      </article>
      {picked && openAt?.place !== picked.place && (
        <div className="fixed inset-x-0 bottom-0 flex justify-center p-4 font-ui">
          <Button
            type="button"
            className="max-w-full shadow-[var(--shadow-hover)]"
            onPointerDown={() => {
              pressing.current = true;
            }}
            onPointerCancel={() => {
              pressing.current = false;
            }}
            onClick={() => {
              pressing.current = false;
              setSent('');
              setOpenAt({ place: picked.place, words: picked });
            }}
          >
            <MessageSquare aria-hidden="true" className="size-4" />
            <span className="truncate">Comment on “{shortQuote(picked.quote)}”</span>
          </Button>
        </div>
      )}
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
            <p>
              Open the link again from the message where you got it. Vlo takes the key out of the address bar
              when it opens the text, so a reload cannot find the key.
            </p>
            <p className="mt-2">If the link has no part after #k=, ask the writer for the whole link.</p>
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
