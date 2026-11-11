import { Pencil, Plus, Trash2 } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import type { CodexChange, CodexEntry, Item } from '@/lib/db';
import { Button } from '@/ui/button';
import { Input } from '@/ui/input';
import { Label } from '@/ui/label';
import { deleteChange, MAX_CHANGE_TEXT, placesOf, saveChange, type ReadingItem } from './codex';

/*
 * The changes of a Codex entry at scenes (F65, plan Task N1), such as "Loses her left eye". A change holds
 * from its scene on, in reading order. The editor's cursor line and the reader panel show the entry as it
 * is at each scene.
 */

const SELECT = 'min-h-11 rounded-md border border-rule bg-bg px-2 text-sm text-text pointer-fine:min-h-9';
const SAVE_FAILED = 'Vlo could not save that change on this device.';

const problemText = (problem: unknown) => (problem instanceof RangeError ? problem.message : SAVE_FAILED);

function ChangeForm({
  entryId,
  change,
  scenes,
  onDone,
}: {
  entryId: string;
  change: CodexChange | null;
  scenes: readonly Item[];
  onDone: (saved: CodexChange | null) => void;
}) {
  const id = useId();
  const [itemId, setItemId] = useState(change?.itemId ?? scenes[0]?.id ?? '');
  const [text, setText] = useState(change?.text ?? '');
  const [leaves, setLeaves] = useState(change?.leaves === true);
  const [error, setError] = useState('');
  // The form takes the place of the button that opened it, so focus moves to its first field.
  const first = useRef<HTMLSelectElement>(null);
  useEffect(() => {
    first.current?.focus();
  }, []);
  // A change can keep a scene of another book or a deleted scene, so its scene stays in the list.
  const known = scenes.some((scene) => scene.id === itemId);

  return (
    <form
      aria-label={change ? 'Edit change' : 'Add a change'}
      className="grid gap-3 rounded-md border border-rule p-3"
      onSubmit={(event) => {
        event.preventDefault();
        saveChange(entryId, { ...(change ? { id: change.id } : {}), itemId, text, leaves }).then(
          onDone,
          (p: unknown) => {
            setError(problemText(p));
          },
        );
      }}
    >
      <div className="grid gap-1.5">
        <Label htmlFor={`${id}-scene`}>From the scene</Label>
        <select
          ref={first}
          id={`${id}-scene`}
          className={SELECT}
          value={itemId}
          onChange={(event) => {
            setItemId(event.target.value);
          }}
        >
          {!known && <option value={itemId}>The scene it has now</option>}
          {scenes.map((scene) => (
            <option key={scene.id} value={scene.id}>
              {scene.title}
            </option>
          ))}
        </select>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor={`${id}-text`}>Change</Label>
        <Input
          id={`${id}-text`}
          value={text}
          maxLength={MAX_CHANGE_TEXT}
          placeholder="Loses her left eye"
          onChange={(event) => {
            setText(event.target.value);
          }}
        />
      </div>
      <label className="flex min-h-11 items-center gap-2 text-sm pointer-fine:min-h-9">
        <input
          type="checkbox"
          checked={leaves}
          onChange={(event) => {
            setLeaves(event.target.checked);
          }}
          className="size-4 accent-[var(--accent)]"
        />
        Leaves the story here
      </label>
      {error && (
        <p role="alert" className="text-sm text-accent-text">
          {error}
        </p>
      )}
      <div className="flex flex-wrap justify-end gap-2">
        <Button
          type="button"
          variant="ghost"
          onClick={() => {
            onDone(null);
          }}
        >
          Cancel
        </Button>
        <Button type="submit">Save</Button>
      </div>
    </form>
  );
}

export function CodexChanges({
  entry,
  projectId,
  order,
  scenes,
}: {
  entry: CodexEntry;
  projectId: string;
  order: readonly ReadingItem[];
  /** The text items of this book, in binder order: the scenes that a new change can name. */
  scenes: readonly Item[];
}) {
  const id = useId();
  const [editing, setEditing] = useState<CodexChange | 'new' | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [deleted, setDeleted] = useState<CodexChange | null>(null);
  const root = useRef<HTMLDivElement>(null);
  // The control that gets focus when it shows: the Undo after a delete, or the button that the writer used.
  const back = useRef<string | null>(null);
  useEffect(() => {
    if (back.current === null) return;
    const target = root.current?.querySelector<HTMLElement>(`[data-focus="${back.current}"]`);
    if (!target) return;
    target.focus();
    back.current = null;
  });

  const places = placesOf(order);
  const where = new Map(order.map((place) => [place.item.id, place]));
  const sceneName = (change: CodexChange) => {
    const place = where.get(change.itemId);
    if (!place) return 'A deleted scene';
    return place.item.projectId === projectId ? place.item.title : `${place.book}: ${place.item.title}`;
  };
  const changes = [...(entry.changes ?? [])].sort(
    (a, b) => (places.get(a.itemId) ?? Infinity) - (places.get(b.itemId) ?? Infinity),
  );
  const announce = (text: string) => {
    setDeleted(null);
    setError('');
    setMessage(text);
  };

  if (editing !== null)
    return (
      <ChangeForm
        entryId={entry.id}
        change={editing === 'new' ? null : editing}
        scenes={scenes}
        onDone={(saved) => {
          setEditing(null);
          if (saved) announce(editing === 'new' ? 'Added the change.' : 'Saved the change.');
        }}
      />
    );

  return (
    <div ref={root} className="grid gap-2">
      <h4 id={`${id}-heading`} className="text-sm font-medium">
        Changes at scenes
      </h4>
      <p className="text-xs text-muted">
        A change holds from its scene on. The editor and the reader panel show the entry as it is at each
        scene.
      </p>
      {changes.length > 0 && (
        <ol aria-labelledby={`${id}-heading`} className="grid gap-1">
          {changes.map((change) => (
            <li key={change.id} className="flex items-start gap-1 rounded-md border border-rule p-2">
              <div className="grid min-w-0 flex-1 gap-0.5 text-sm [overflow-wrap:anywhere]">
                <p className="text-xs text-muted">{sceneName(change)}</p>
                <p>{change.text}</p>
                {change.leaves && <p className="text-xs text-muted">Leaves the story here</p>}
              </div>
              <Button
                variant="ghost"
                className="px-2"
                aria-label={`Edit the change “${change.text}”`}
                data-focus={`edit-${change.id}`}
                onClick={() => {
                  back.current = `edit-${change.id}`;
                  setEditing(change);
                }}
              >
                <Pencil aria-hidden="true" className="size-4" />
              </Button>
              <Button
                variant="ghost"
                className="px-2"
                aria-label={`Delete the change “${change.text}”`}
                onClick={() => {
                  deleteChange(entry.id, change.id).then(
                    (gone) => {
                      setError('');
                      setMessage('Deleted the change.');
                      back.current = 'undo';
                      setDeleted(gone ?? null);
                    },
                    () => {
                      setError(SAVE_FAILED);
                    },
                  );
                }}
              >
                <Trash2 aria-hidden="true" className="size-4" />
              </Button>
            </li>
          ))}
        </ol>
      )}
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <p role="status" className={message === '' ? 'sr-only' : 'text-muted'}>
          {message}
        </p>
        {deleted && (
          <Button
            variant="outline"
            data-focus="undo"
            onClick={() => {
              const change = deleted;
              saveChange(entry.id, { ...change, leaves: change.leaves === true }).then(
                () => {
                  back.current = `edit-${change.id}`;
                  announce('Restored the change.');
                },
                (p: unknown) => {
                  setError(problemText(p));
                },
              );
            }}
          >
            Undo
          </Button>
        )}
      </div>
      {error && (
        <p role="alert" className="text-sm text-accent-text">
          {error}
        </p>
      )}
      {scenes.length === 0 ? (
        <p className="text-xs text-muted">Add a scene to the binder first.</p>
      ) : (
        <Button
          variant="outline"
          className="justify-self-start"
          data-focus="add"
          onClick={() => {
            back.current = 'add';
            setEditing('new');
          }}
        >
          <Plus aria-hidden="true" className="size-4" />
          Add a change
        </Button>
      )}
    </div>
  );
}
