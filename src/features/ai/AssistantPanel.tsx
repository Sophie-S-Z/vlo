import { Square, X } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import { getActiveEditor } from '@/features/editor/commands/editorBus';
import { findTarget, insertAiText } from '@/features/editor/extensions/aiOrigin';
import { leafText } from '@/features/editor/leafText';
import { updateItem } from '@/features/binder/items';
import { updateProjectSettings } from '@/features/library/projects';
import { hasTemplate } from '@/features/library/templates';
import { clock } from '@/lib/clock';
import type { Item, Project } from '@/lib/db';
import type { PrivatePerson } from '@/lib/privacy';
import { Button } from '@/ui/button';
import { Input } from '@/ui/input';
import { Label } from '@/ui/label';
import { Textarea } from '@/ui/textarea';
import {
  clearProject,
  getEntries,
  markUsed,
  removeEntry,
  setTarget,
  startEntry,
  stopEntry,
  useEntries,
  type Entry,
  type Target,
} from './assistantStore';
import { CONTINUE_WORDS, COWRITER_ACTIONS, splitAlternatives } from './cowriter';
import { providerEngine } from './engine/engine';
import { PRESETS } from './engine/presets';
import { EngineError, type Engine } from './engine/types';
import { cancelWebLlmLoad, LOAD_CANCELLED, loadWebLlm, unloadWebLlm } from './engine/webllm';
import { engineName, EngineSettings } from './EngineSettings';
import { KeyDialog } from './KeyDialog';
import { sessionKey } from './keys';
import { READER_ACTIONS, restoreNames, splitPanel, type AiRequest } from './reader';
import { buildAiRequest, isCowriterAction, type ActionId } from './request';
import { SendDrawer } from './SendDrawer';
import { DEFAULT_ENGINE, drawerOff, loadEngineChoice, setDrawerOff, type EngineChoice } from './settings';
import { recordAiRequest } from '@/features/usage/usage';
import type { EditorForm } from '@/features/library/templates';

/*
 * The Assistant panel (spec section 10, plan decision P5). It loads only outside Pen mode. Every answer
 * stays here. In Reader mode no answer has a way into the manuscript. In Co-writer mode, Insert puts a
 * draft in the text with the aiOrigin mark, and only when the writer presses it.
 */

const selectClass =
  'min-h-11 w-full rounded-md border border-rule bg-bg px-3 text-base text-text focus-visible:border-accent';

export interface AssistantPanelProps {
  project: Project;
  items: readonly Item[];
  /** The open item, if it has an editor. */
  item: Item | undefined;
  kind: EditorForm | null;
  /** Runs after an Insert, so a phone can close the sheet and show the text. */
  onInserted?: () => void;
}

/** Stops every answer of the project and frees the in-browser model, as when the project goes to Pen. */
export async function shutDownAssistant(projectId: string): Promise<void> {
  clearProject(projectId);
  await unloadWebLlm();
}

interface Pending {
  request: AiRequest;
  host: string;
  aliased: boolean;
  /** The people with each marked name as a variant, which also turn the answer back to real names. */
  people: PrivatePerson[];
  /** The words the writer selected for a rewrite, to replace on Insert. */
  target?: Target;
}

const STATUS_TEXT: Record<Entry['status'], string> = {
  running: 'Writing',
  done: 'Done',
  stopped: 'Stopped',
  error: 'Stopped with an error',
};

export default function AssistantPanel({ project, items, item, kind, onInserted }: AssistantPanelProps) {
  const id = useId();
  const cowriter = project.aiMode === 'cowriter';
  const entries = useEntries(project.id);
  const [choice, setChoice] = useState<EngineChoice | null>(null);
  const [editing, setEditing] = useState(false);
  const [chosen, setAction] = useState<ActionId>('feedback');
  const [question, setQuestion] = useState('');
  const [words, setWords] = useState<number>(100);
  const [instruction, setInstruction] = useState('');
  const [topic, setTopic] = useState('');
  const [error, setError] = useState('');
  const [pending, setPending] = useState<Pending | null>(null);
  const [keyFor, setKeyFor] = useState<Pending | null>(null);
  const [loading, setLoading] = useState<{ share: number; text: string } | null>(null);
  const [announce, setAnnounce] = useState('');
  const [busy, setBusy] = useState(false);
  const working = useRef(false);
  const cancelled = useRef(false);
  const mounted = useRef(true);
  const listRef = useRef<HTMLOListElement>(null);
  const actionRef = useRef<HTMLSelectElement>(null);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    let live = true;
    void loadEngineChoice()
      .catch(() => DEFAULT_ENGINE)
      .then((c) => {
        if (live) setChoice(c);
      });
    return () => {
      live = false;
    };
  }, []);

  // A switch from Co-writer to Reader leaves no drafting action chosen.
  const action: ActionId = !cowriter && isCowriterAction(chosen) ? 'feedback' : chosen;

  const aliasOn = hasTemplate(project, 'memoir') && project.settings.aliasAiRequests;

  const hostOf = (c: EngineChoice) =>
    c.kind === 'webllm' ? 'this browser' : new URL(PRESETS[c.preset].base).host;

  const prepare = async () => {
    if (working.current) return;
    working.current = true;
    setBusy(true);
    try {
      await prepareNow();
    } finally {
      working.current = false;
      if (mounted.current) setBusy(false);
    }
  };

  const prepareNow = async () => {
    setError('');
    if (!choice) return;
    const editor = getActiveEditor()?.editor;
    const built = await buildAiRequest({
      project,
      items,
      action,
      question,
      words,
      instruction,
      topic,
      open: item && kind && editor && !editor.isDestroyed ? { item, kind, state: editor.state } : undefined,
      inBrowser: choice.kind !== 'provider',
    });
    if (!built.ok) {
      setError(built.message);
      return;
    }
    const next: Pending = {
      request: built.request,
      host: hostOf(choice),
      aliased: built.aliased,
      people: built.people,
      ...(built.target ? { target: built.target } : {}),
    };
    if (choice.kind === 'provider' && !PRESETS[choice.preset].local && !sessionKey(choice.preset)) {
      setKeyFor(next);
      return;
    }
    await review(next);
  };

  /** Shows the drawer, or sends at once when the writer turned the drawer off. */
  const review = async (next: Pending) => {
    let off = false;
    try {
      off = await drawerOff();
    } catch {
      off = false;
    }
    if (off) await send(next);
    else setPending(next);
  };

  const engineFor = async (c: EngineChoice): Promise<Engine> => {
    if (c.kind === 'provider') return providerEngine(c.preset, c.model, sessionKey(c.preset));
    cancelled.current = false;
    setLoading({ share: 0, text: '' });
    try {
      return await loadWebLlm(c.model, (share, text) => {
        if (mounted.current && !cancelled.current) setLoading({ share, text });
      });
    } finally {
      if (mounted.current) setLoading(null);
    }
  };

  const cancelLoad = () => {
    cancelled.current = true;
    cancelWebLlmLoad();
    setLoading(null);
    setError(`${LOAD_CANCELLED} A file that is downloading now still ends, and then Vlo frees it.`);
    actionRef.current?.focus();
  };

  const send = async (next: Pending) => {
    setPending(null);
    if (!choice) return;
    let engine: Engine;
    try {
      engine = await engineFor(choice);
    } catch (problem) {
      // A cancel already told the writer, and a panel that closed has nobody to tell.
      if (!mounted.current || (problem instanceof EngineError && problem.kind === 'cancelled')) return;
      setError(
        problem instanceof EngineError || problem instanceof RangeError || problem instanceof Error
          ? problem.message
          : 'Vlo could not start the engine.',
      );
      actionRef.current?.focus();
      return;
    }
    recordAiRequest(project.aiMode);
    const entryId = startEntry(
      project.id,
      next.request,
      engine,
      (text) => restoreNames(text, next.people, aliasOn),
      next.request.label,
      next.target,
    );
    if (!mounted.current) return;
    setAnnounce(`Asked: ${next.request.label}.`);
    // The new answer takes focus, so the writer hears it and can stop it.
    requestAnimationFrame(() => {
      listRef.current?.querySelector<HTMLElement>(`[data-entry="${entryId}"]`)?.focus();
    });
  };

  const saveSynopsis = async (entry: Entry) => {
    if (!entry.itemId) return;
    try {
      await updateItem(entry.itemId, { synopsis: entry.text.trim() });
      markUsed(entry.id, 'Used as the synopsis.');
    } catch {
      markUsed(entry.id, 'Vlo could not save the synopsis on this device.');
    }
  };

  const insert = (entry: Entry, text: string) => {
    const editor = getActiveEditor()?.editor;
    if (!cowriter || !editor || !kind || entry.itemId !== item?.id) return;
    const sep = kind === 'poem' ? '\n' : '\n\n';
    if (entry.target) {
      // A rewrite replaces the words it was asked about, or the words that its last Insert put in.
      const found = findTarget(editor.state.doc, entry.target, sep);
      const { from, to } = editor.state.selection;
      if (found) editor.commands.setTextSelection({ from: found.from, to: found.to });
      else if (from === to) {
        markUsed(entry.id, 'The words to rewrite changed. Select the words to replace, then press Insert.');
        return;
      }
    }
    const done = insertAiText(
      editor,
      text,
      { provider: entry.engine.label, model: entry.engine.model, createdAt: clock.now() },
      kind,
    );
    if (!done) {
      markUsed(entry.id, 'Vlo could not insert this draft here.');
      return;
    }
    // "Insert version 2" after version 1 replaces version 1.
    if (entry.target)
      setTarget(entry.id, {
        from: done.from,
        to: done.to,
        text: editor.state.doc.textBetween(done.from, done.to, sep, leafText),
      });
    markUsed(entry.id, 'Inserted in your text. Undo removes it.');
    onInserted?.();
    if (project.settings.aiInsertedAt === undefined)
      void updateProjectSettings(project.id, { aiInsertedAt: clock.now() }).catch(() => undefined);
  };

  const actionNeedsItem =
    isCowriterAction(action) || READER_ACTIONS.find((a) => a.id === action)?.needsItem === true;
  const canAsk = choice !== null && loading === null && !busy && (!actionNeedsItem || item !== undefined);

  /** After Stop the answer card keeps focus. After Remove the next answer, or the action, takes it. */
  const focusAfter = (entryId: string, removed: boolean) => {
    requestAnimationFrame(() => {
      const list = listRef.current;
      if (!removed) {
        list?.querySelector<HTMLElement>(`[data-entry="${entryId}"]`)?.focus();
        return;
      }
      const first = getEntries(project.id)[0];
      const next = first ? list?.querySelector<HTMLElement>(`[data-entry="${first.id}"]`) : null;
      (next ?? actionRef.current)?.focus();
    });
  };

  return (
    <section aria-labelledby={`${id}-title`} className="grid content-start gap-4" data-testid="assistant">
      <div className="grid gap-1">
        <h2 id={`${id}-title`} className="font-display text-xl font-semibold">
          Assistant
        </h2>
        <p className="text-sm text-muted">
          {cowriter
            ? 'Co-writer mode. Each draft shows here first. Insert puts it in your text with the AI mark.'
            : 'Reader mode. Answers stay in this panel and never enter your text.'}
        </p>
      </div>

      {choice &&
        (editing ? (
          <EngineSettings
            choice={choice}
            onSaved={(next) => {
              setChoice(next);
              setEditing(false);
            }}
            onCancel={() => {
              setEditing(false);
            }}
          />
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <p className="min-w-0 [overflow-wrap:anywhere]">
              <span className="text-muted">Engine: </span>
              {engineName(choice)}
            </p>
            <Button
              variant="outline"
              onClick={() => {
                setEditing(true);
              }}
            >
              Change engine
            </Button>
          </div>
        ))}

      {!editing && !pending && (
        <form
          aria-label="Ask the AI"
          className="grid gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            void prepare();
          }}
        >
          <div className="grid gap-1.5">
            <Label htmlFor={`${id}-action`}>What to ask</Label>
            <select
              ref={actionRef}
              id={`${id}-action`}
              className={selectClass}
              value={action}
              onChange={(event) => {
                setAction(event.target.value as ActionId);
                setError('');
              }}
            >
              <optgroup label="Read">
                {READER_ACTIONS.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.label}
                  </option>
                ))}
              </optgroup>
              {cowriter && (
                <optgroup label="Write">
                  {COWRITER_ACTIONS.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.label}
                    </option>
                  ))}
                </optgroup>
              )}
            </select>
          </div>

          {action === 'ask' && (
            <div className="grid gap-1.5">
              <Label htmlFor={`${id}-question`}>Your question</Label>
              <Textarea
                id={`${id}-question`}
                rows={3}
                value={question}
                onChange={(event) => {
                  setQuestion(event.target.value);
                }}
              />
            </div>
          )}
          {action === 'panel' && (
            <p className="text-sm text-muted">
              Four readers give notes: a first-time reader, a genre fan, a developmental editor and a line
              editor. The request holds the notes of the Codex entries that the text names.
            </p>
          )}
          {action === 'continue' && (
            <div className="grid gap-1.5">
              <Label htmlFor={`${id}-words`}>Length</Label>
              <select
                id={`${id}-words`}
                className={selectClass}
                value={words}
                onChange={(event) => {
                  setWords(Number(event.target.value));
                }}
              >
                {CONTINUE_WORDS.map((n) => (
                  <option key={n} value={n}>
                    About {n} words
                  </option>
                ))}
              </select>
              <p className="text-sm text-muted">The draft continues from the cursor.</p>
            </div>
          )}
          {(action === 'rewrite' || action === 'alternatives') && (
            <div className="grid gap-1.5">
              <Label htmlFor={`${id}-how`}>How to change it (you can leave this empty)</Label>
              <Input
                id={`${id}-how`}
                value={instruction}
                placeholder="Shorter, in past tense"
                onChange={(event) => {
                  setInstruction(event.target.value);
                }}
              />
              <p className="text-sm text-muted">Vlo uses the words that you select in your text.</p>
            </div>
          )}
          {action === 'brainstorm' && (
            <div className="grid gap-1.5">
              <Label htmlFor={`${id}-topic`}>Ideas for</Label>
              <Input
                id={`${id}-topic`}
                value={topic}
                placeholder="What the sister hides"
                onChange={(event) => {
                  setTopic(event.target.value);
                }}
              />
              <p className="text-sm text-muted">Ideas stay in this panel.</p>
            </div>
          )}

          {actionNeedsItem && item && (
            <p className="text-sm text-muted [overflow-wrap:anywhere]">About: {item.title}</p>
          )}
          {actionNeedsItem && !item && <p className="text-sm text-muted">Open an item first.</p>}
          {error && (
            <p role="alert" className="text-sm text-accent-text">
              {error}
            </p>
          )}
          {loading && (
            <div className="grid gap-1 text-sm">
              <label htmlFor={`${id}-load`}>Loading the model in this browser</label>
              <progress
                id={`${id}-load`}
                max={1}
                value={loading.share}
                className="w-full accent-[var(--accent)]"
              />
              <p className="text-muted [overflow-wrap:anywhere]">
                {Math.round(loading.share * 100)}%. The first time, the browser downloads the model.
              </p>
              <div>
                <Button type="button" variant="outline" onClick={cancelLoad}>
                  Stop loading
                </Button>
              </div>
            </div>
          )}
          <div className="flex justify-end">
            <Button type="submit" disabled={!canAsk}>
              Prepare the request
            </Button>
          </div>
        </form>
      )}

      {pending && (
        <SendDrawer
          request={pending.request}
          host={pending.host}
          aliased={pending.aliased}
          onCancel={() => {
            setPending(null);
            requestAnimationFrame(() => actionRef.current?.focus());
          }}
          onSend={(hide) => {
            if (hide) void setDrawerOff(true).catch(() => undefined);
            void send(pending);
          }}
        />
      )}

      {keyFor && choice?.kind === 'provider' && (
        <KeyDialog
          preset={choice.preset}
          open
          onOpenChange={(open) => {
            if (open) return;
            setKeyFor(null);
            requestAnimationFrame(() => actionRef.current?.focus());
          }}
          onReady={() => {
            const next = keyFor;
            setKeyFor(null);
            void review(next);
          }}
        />
      )}

      <p aria-live="polite" className="sr-only">
        {announce}
      </p>

      {entries.length > 0 && (
        <div className="grid gap-2">
          <h3 className="font-display text-lg font-semibold">Answers</h3>
          <ol ref={listRef} className="grid gap-3">
            {entries.map((entry) => (
              <AnswerCard
                key={entry.id}
                entry={entry}
                canInsert={
                  cowriter && entry.itemId !== undefined && entry.itemId === item?.id && kind !== null
                }
                openTitle={items.find((i) => i.id === entry.itemId)?.title}
                onInsert={(text) => {
                  insert(entry, text);
                }}
                onStop={() => {
                  stopEntry(entry.id);
                  focusAfter(entry.id, false);
                }}
                onRemove={() => {
                  removeEntry(entry.id);
                  focusAfter(entry.id, true);
                }}
                onSynopsis={() => {
                  void saveSynopsis(entry);
                }}
              />
            ))}
          </ol>
        </div>
      )}
    </section>
  );
}

/** An answer is not a drag source, so no answer reaches the text without Insert. */
function AnswerText({ text }: { text: string }) {
  return (
    <div
      className="vlo-answer text-sm whitespace-pre-wrap [overflow-wrap:anywhere]"
      draggable={false}
      onDragStart={(event) => {
        event.preventDefault();
      }}
    >
      {text}
    </div>
  );
}

function AnswerCard({
  entry,
  canInsert,
  openTitle,
  onInsert,
  onSynopsis,
  onStop,
  onRemove,
}: {
  entry: Entry;
  canInsert: boolean;
  openTitle: string | undefined;
  onInsert: (text: string) => void;
  onSynopsis: () => void;
  onStop: () => void;
  onRemove: () => void;
}) {
  const id = useId();
  const running = entry.status === 'running';
  const drafts =
    entry.result === 'alternatives' && !running ? splitAlternatives(entry.text) : [entry.text.trim()];
  const writable = entry.result === 'draft' || entry.result === 'alternatives';
  const readers = entry.result === 'panel' ? splitPanel(entry.text) : [];

  return (
    <li
      data-entry={entry.id}
      tabIndex={-1}
      aria-labelledby={`${id}-label`}
      aria-busy={running || undefined}
      className="grid gap-2 rounded-[var(--radius-card)] border border-rule bg-surface p-3 focus-visible:border-accent"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h4 id={`${id}-label`} className="text-sm font-semibold [overflow-wrap:anywhere]">
            {entry.label}
          </h4>
          <p className="text-xs text-muted">
            {entry.engine.label}, {entry.engine.model}. {STATUS_TEXT[entry.status]}.
          </p>
        </div>
        {running ? (
          <Button variant="outline" className="min-w-11 px-3" onClick={onStop}>
            <Square aria-hidden="true" className="size-4" />
            Stop
          </Button>
        ) : (
          <Button
            variant="ghost"
            className="min-w-11 px-0"
            aria-label={`Remove the answer: ${entry.label}`}
            onClick={onRemove}
          >
            <X aria-hidden="true" className="size-4" />
          </Button>
        )}
      </div>

      {readers.length > 0 ? (
        <ul aria-label="Readers" className="grid gap-2">
          {readers.map(({ reader, notes }, index) => (
            <li key={index} className="grid gap-1 rounded-md border border-rule p-2">
              <h5 className="text-xs font-semibold text-muted">{reader}</h5>
              <AnswerText text={notes} />
            </li>
          ))}
        </ul>
      ) : (
        drafts.map((text, index) => (
          <div key={index} className="grid gap-2">
            {drafts.length > 1 && <p className="text-xs font-semibold text-muted">Version {index + 1}</p>}
            <AnswerText text={text || (running ? 'Waiting for the first words.' : '')} />
            {canInsert && writable && !running && text !== '' && (
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    onInsert(text);
                  }}
                >
                  {drafts.length > 1 ? `Insert version ${String(index + 1)}` : 'Insert'}
                </Button>
              </div>
            )}
          </div>
        ))
      )}

      {!canInsert && writable && !running && openTitle && (
        <p className="text-sm text-muted">Open {openTitle} to insert this draft.</p>
      )}
      {entry.result === 'synopsis' && !running && entry.text.trim() !== '' && entry.used === undefined && (
        <div>
          <Button variant="outline" onClick={onSynopsis}>
            Use as synopsis
          </Button>
        </div>
      )}
      {entry.error && <p className="text-sm text-accent-text">{entry.error}</p>}
      {entry.used && <p className="text-sm text-muted">{entry.used}</p>}
    </li>
  );
}
