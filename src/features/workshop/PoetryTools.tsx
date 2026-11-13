import { useId, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import type { Project } from '@/lib/db';
import { Button } from '@/ui/button';
import { cn } from '@/ui/cn';
import { Input } from '@/ui/input';
import { Label } from '@/ui/label';
import { Switch } from '@/ui/switch';
import { Textarea } from '@/ui/textarea';
import { addPoem } from './newPoem';
import { echoes, erasurePoem, erasureTokens, goldenShovel, lineEndings, shovelWords } from './poetry';
import type { TextItem } from './WorkshopPage';

/* The poetry tools of the Workshop (Phase 17 decision D1). The logic is in poetry.ts. */

const SELECT =
  'min-h-11 rounded-md border border-rule bg-bg px-3 text-base text-text pointer-fine:min-h-10 pointer-fine:text-sm';

/** A poem's text as the page shows it: every space kept, in the writing font. */
function PoemText({ text, label }: { text: string; label: string }) {
  return (
    <pre
      aria-label={label}
      className="overflow-x-auto rounded-[var(--radius-card)] border border-rule bg-surface p-4 font-manuscript text-base whitespace-pre"
    >
      {text}
    </pre>
  );
}

function useMakePoem(project: Project) {
  const navigate = useNavigate();
  const [state, setState] = useState<'idle' | 'busy' | 'failed'>('idle');
  return {
    state,
    make: async (title: string, text: string) => {
      setState('busy');
      try {
        const id = await addPoem(project.id, title.trim() === '' ? 'Untitled poem' : title, text);
        await navigate(`/p/${project.id}?item=${id}`);
      } catch {
        setState('failed');
      }
    },
  };
}

function MadeError({ state }: { state: 'idle' | 'busy' | 'failed' }) {
  return (
    <p role="status" className="text-sm text-accent-text">
      {state === 'failed' ? 'Vlo could not save the poem on this device. Try again.' : ''}
    </p>
  );
}

export function ErasureTool({ project, texts }: { project: Project; texts: TextItem[] }) {
  const ids = useId();
  const sources = texts.filter((t) => t.text.trim() !== '');
  // Null picks the first poem with words, which can arrive after the tool opens.
  const [sourceId, setSourceId] = useState<string | null>(null);
  const [pasted, setPasted] = useState('');
  const [kept, setKept] = useState<ReadonlySet<number>>(new Set());
  const [marks, setMarks] = useState(true);
  const [title, setTitle] = useState<string | null>(null);
  const chosen =
    sourceId === null ? (sources[0] ?? null) : (sources.find((s) => s.item.id === sourceId) ?? null);
  const source = chosen ? chosen.text : pasted;
  const lines = erasureTokens(source);
  const poem = erasurePoem(lines, kept, marks);
  const shownTitle = title ?? (chosen ? `Erasure of ${chosen.item.title}` : 'Erasure');
  const made = useMakePoem(project);

  const toggle = (word: number) => {
    setKept((prev) => {
      const next = new Set(prev);
      if (next.has(word)) next.delete(word);
      else next.add(word);
      return next;
    });
  };

  return (
    <div className="grid gap-6">
      <div className="grid gap-2 sm:max-w-md">
        <Label htmlFor={`${ids}-source`}>Source</Label>
        <select
          id={`${ids}-source`}
          value={chosen ? chosen.item.id : 'paste'}
          onChange={(event) => {
            setSourceId(event.target.value);
            setKept(new Set());
            setTitle(null);
          }}
          className={SELECT}
        >
          {sources.map((s) => (
            <option key={s.item.id} value={s.item.id}>
              {s.item.title}
            </option>
          ))}
          <option value="paste">A text that I paste</option>
        </select>
      </div>
      {!chosen && (
        <div className="grid gap-2">
          <Label htmlFor={`${ids}-paste`}>Text to erase</Label>
          <Textarea
            id={`${ids}-paste`}
            value={pasted}
            rows={6}
            onChange={(event) => {
              setPasted(event.target.value);
              setKept(new Set());
            }}
            placeholder="Paste a page of prose, a letter, a news story or an old poem of your own."
          />
        </div>
      )}
      {lines.some((l) => l.some((t) => t.word !== null)) && (
        <div className="grid gap-2">
          <p id={`${ids}-words-about`} className="text-sm text-muted">
            Choose the words to keep. Choose a word again to let it go.
          </p>
          <div
            role="group"
            aria-label="Words of the source"
            aria-describedby={`${ids}-words-about`}
            className="max-h-[50dvh] overflow-auto rounded-[var(--radius-card)] border border-rule p-4 font-manuscript text-base leading-8 whitespace-pre-wrap"
          >
            {lines.map((tokens, i) => (
              <div key={i} className="min-h-8">
                {tokens.map((token, j) =>
                  token.word === null ? (
                    <span key={j} aria-hidden="true" className="text-muted/50">
                      {token.text}
                    </span>
                  ) : (
                    <button
                      key={j}
                      type="button"
                      aria-pressed={kept.has(token.word)}
                      onClick={() => {
                        if (token.word !== null) toggle(token.word);
                      }}
                      className={cn(
                        'rounded-sm px-0.5 align-baseline transition-colors',
                        kept.has(token.word)
                          ? 'bg-accent text-on-accent'
                          : 'text-muted hover:bg-surface hover:text-text',
                      )}
                    >
                      {token.text}
                    </button>
                  ),
                )}
              </div>
            ))}
          </div>
          <div className="flex items-center gap-3">
            <Switch id={`${ids}-marks`} checked={marks} onCheckedChange={setMarks} />
            <Label htmlFor={`${ids}-marks`}>Keep the punctuation right after a kept word</Label>
          </div>
        </div>
      )}
      {poem !== '' && (
        <div className="grid gap-4">
          <h3 className="font-display text-xl font-semibold">The erasure</h3>
          <PoemText text={poem} label="The erasure" />
          <div className="flex flex-wrap items-end gap-3">
            <div className="grid min-w-60 flex-1 gap-2 sm:max-w-md">
              <Label htmlFor={`${ids}-title`}>Title of the new poem</Label>
              <Input
                id={`${ids}-title`}
                value={shownTitle}
                onChange={(event) => {
                  setTitle(event.target.value);
                }}
              />
            </div>
            <Button
              type="button"
              disabled={made.state === 'busy'}
              onClick={() => {
                void made.make(shownTitle, poem);
              }}
            >
              Make the poem
            </Button>
          </div>
          <MadeError state={made.state} />
        </div>
      )}
    </div>
  );
}

const STANZA_SIZES = [
  { value: 0, label: 'One stanza' },
  { value: 2, label: 'Couplets' },
  { value: 3, label: 'Tercets' },
  { value: 4, label: 'Quatrains' },
];

export function ShovelTool({ project }: { project: Project }) {
  const ids = useId();
  const [line, setLine] = useState('');
  const [poet, setPoet] = useState('');
  const [size, setSize] = useState(0);
  const [title, setTitle] = useState<string | null>(null);
  const words = shovelWords(line);
  const poem = goldenShovel(line, poet, size);
  const shownTitle = title ?? (poet.trim() === '' ? 'Golden shovel' : `Golden shovel after ${poet.trim()}`);
  const made = useMakePoem(project);
  return (
    <div className="grid gap-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor={`${ids}-line`}>The line you borrow</Label>
          <Input
            id={`${ids}-line`}
            value={line}
            onChange={(event) => {
              setLine(event.target.value);
            }}
            placeholder="A line from a poem that you love"
            autoComplete="off"
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor={`${ids}-poet`}>Its poet</Label>
          <Input
            id={`${ids}-poet`}
            value={poet}
            onChange={(event) => {
              setPoet(event.target.value);
            }}
            autoComplete="off"
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor={`${ids}-size`}>Stanzas</Label>
          <select
            id={`${ids}-size`}
            value={size}
            onChange={(event) => {
              setSize(Number(event.target.value));
            }}
            className={SELECT}
          >
            {STANZA_SIZES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
      </div>
      {words.length > 0 && (
        <div className="grid gap-4">
          <p className="text-sm text-muted">
            The poem has {words.length} {words.length === 1 ? 'line' : 'lines'}. Each one ends with the next
            word of the line, so the borrowed line reads down the right edge. Write the start of each line in
            the editor.
          </p>
          <PoemText text={poem} label="The golden shovel to write into" />
          <div className="flex flex-wrap items-end gap-3">
            <div className="grid min-w-60 flex-1 gap-2 sm:max-w-md">
              <Label htmlFor={`${ids}-title`}>Title of the new poem</Label>
              <Input
                id={`${ids}-title`}
                value={shownTitle}
                onChange={(event) => {
                  setTitle(event.target.value);
                }}
              />
            </div>
            <Button
              type="button"
              disabled={made.state === 'busy'}
              onClick={() => {
                void made.make(shownTitle, poem);
              }}
            >
              Make the poem
            </Button>
          </div>
          <MadeError state={made.state} />
        </div>
      )}
    </div>
  );
}

/** The most echoes that the list shows. */
const ECHO_LIMIT = 40;

export function EchoesTool({ project, texts }: { project: Project; texts: TextItem[] }) {
  const poems = texts.filter((t) => t.item.kind === 'poem');
  const list = echoes(poems.map((p) => ({ id: p.item.id, title: p.item.title, text: p.text })));
  if (poems.length < 2)
    return <p className="max-w-prose text-muted">Echoes needs two poems or more with words in them.</p>;
  if (list.length === 0)
    return <p className="max-w-prose text-muted">No word comes back yet from one poem to another.</p>;
  return (
    <div className="grid gap-3">
      <p className="max-w-prose text-sm text-muted">
        Echoes reads English words. It leaves out small common words, and it counts “tide” and “tides” as one
        word. Choose a poem to open it.
      </p>
      <ol className="grid gap-2" aria-label="Echoes">
        {list.slice(0, ECHO_LIMIT).map((echo) => (
          <li
            key={echo.word}
            className="grid gap-2 rounded-[var(--radius-card)] border border-rule p-3 sm:grid-cols-[10rem_1fr] sm:items-baseline"
          >
            <p>
              <span className="font-manuscript text-lg">{echo.word}</span>{' '}
              <span className="text-sm text-muted">
                in {echo.poems.length} poems, {echo.total} times
              </span>
            </p>
            <ul className="flex flex-wrap gap-1.5">
              {echo.poems.map((poem) => (
                <li key={poem.id}>
                  <Link
                    to={`/p/${project.id}?item=${poem.id}`}
                    className="inline-flex min-h-8 items-center rounded-full border border-rule px-2.5 text-sm hover:border-accent"
                  >
                    {poem.title}
                    {poem.count > 1 && <span className="ml-1 text-muted">×{poem.count}</span>}
                  </Link>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ol>
    </div>
  );
}

export function EndingsTool({ project, texts }: { project: Project; texts: TextItem[] }) {
  const ids = useId();
  const poems = texts.filter((t) => t.item.kind === 'poem' && t.text.trim() !== '');
  const [poemId, setPoemId] = useState(poems[0]?.item.id ?? '');
  const poem = poems.find((p) => p.item.id === poemId) ?? poems[0];
  if (!poem) return <p className="max-w-prose text-muted">Line endings needs a poem with words in it.</p>;
  const list = lineEndings(poem.text);
  const pauses = list.filter((l) => l.pause).length;
  const small = list.filter((l) => l.small).length;
  return (
    <div className="grid gap-4">
      <div className="grid gap-2 sm:max-w-md">
        <Label htmlFor={`${ids}-poem`}>Poem</Label>
        <select
          id={`${ids}-poem`}
          value={poem.item.id}
          onChange={(event) => {
            setPoemId(event.target.value);
          }}
          className={SELECT}
        >
          {poems.map((p) => (
            <option key={p.item.id} value={p.item.id}>
              {p.item.title}
            </option>
          ))}
        </select>
      </div>
      <p role="status">
        {list.length} {list.length === 1 ? 'line' : 'lines'}: {pauses} end on a pause, {list.length - pauses}{' '}
        run on.{' '}
        {small === 0
          ? 'No line ends on a small word.'
          : `${String(small)} end on a small word, such as “the” or “of”.`}
      </p>
      <ol className="grid gap-1" aria-label="Lines">
        {list.map((line) => (
          <li key={line.number} className="grid grid-cols-[2.5rem_1fr_auto] items-baseline gap-2">
            <span className="text-right text-sm text-muted tabular-nums">{line.number}</span>
            <span className="font-manuscript whitespace-pre-wrap">{line.text}</span>
            <span className="flex gap-1 text-xs">
              <span
                className={cn(
                  'rounded-full border px-2 py-0.5',
                  line.pause ? 'border-rule text-muted' : 'border-accent text-accent-text',
                )}
              >
                {line.pause ? 'Pause' : 'Runs on'}
              </span>
              {line.small && (
                <span className="rounded-full bg-accent px-2 py-0.5 text-on-accent">Small word</span>
              )}
            </span>
          </li>
        ))}
      </ol>
      <p className="text-sm text-muted">
        <Link to={`/p/${project.id}?item=${poem.item.id}`} className="text-accent-text underline">
          Open {poem.item.title}
        </Link>{' '}
        to change a line.
      </p>
    </div>
  );
}
