import { ArrowDown, ArrowUp } from 'lucide-react';
import { useId, useState, type KeyboardEvent } from 'react';
import { updateItem } from '@/features/binder/items';
import { ColorPicker } from '@/features/board/BoardDialogs';
import type { Item, LifeStage } from '@/lib/db';
import { Button } from '@/ui/button';
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from '@/ui/dialog';
import { Input } from '@/ui/input';
import { Label } from '@/ui/label';
import { cn } from '@/ui/cn';
import { formatDate, isDate } from './dates';
import { addStage, cleanThemes, deleteStage, moveStage, setMemory, updateStage } from './memories';

/* The Memory Timeline's forms: a memory's date, stage and themes, and the life stages (plan Task C4). */

const SAVE_FAILED = 'Vlo could not save this change on this device. Check the storage space and try again.';
const DATE_HINT = 'A year, a month or a day: 1994, 1994-07 or 1994-07-12.';

/** Edit a memory: its title, date, life stage and themes. */
export function MemoryDialog({
  memory,
  stages,
  themes,
  onClose,
  onSaved,
}: {
  memory: Item | null;
  stages: readonly LifeStage[];
  /** Every theme of the project, to pick from. */
  themes: readonly string[];
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  return (
    <Dialog
      open={memory !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      {memory && (
        <DialogContent>
          <MemoryForm
            key={memory.id}
            memory={memory}
            stages={stages}
            themes={themes}
            onDone={(message) => {
              onClose();
              onSaved(message);
            }}
          />
        </DialogContent>
      )}
    </Dialog>
  );
}

function MemoryForm({
  memory,
  stages,
  themes,
  onDone,
}: {
  memory: Item;
  stages: readonly LifeStage[];
  themes: readonly string[];
  onDone: (message: string) => void;
}) {
  const [title, setTitle] = useState(memory.title);
  const [date, setDate] = useState(memory.memory?.date ?? '');
  const [stage, setStage] = useState(memory.memory?.lifeStageId ?? '');
  const [chosen, setChosen] = useState<string[]>(memory.memory?.themes ?? []);
  const [newTheme, setNewTheme] = useState('');
  const [error, setError] = useState<string | null>(null);
  const titleId = useId();
  const dateId = useId();
  const dateHintId = useId();
  const stageId = useId();
  const themeId = useId();
  const errorId = useId();

  const has = (theme: string) => chosen.some((t) => t.toLocaleLowerCase() === theme.toLocaleLowerCase());
  const toggle = (theme: string) => {
    setChosen((now) =>
      has(theme) ? now.filter((t) => t.toLocaleLowerCase() !== theme.toLocaleLowerCase()) : [...now, theme],
    );
  };
  const offered = cleanThemes([...themes, ...chosen]);

  async function save() {
    const trimmed = date.trim();
    if (title.trim() === '') {
      setError('A memory needs a title.');
      return;
    }
    if (trimmed !== '' && !isDate(trimmed)) {
      setError(`Vlo cannot read that date. ${DATE_HINT}`);
      return;
    }
    try {
      if (title.trim() !== memory.title) await updateItem(memory.id, { title });
      await setMemory(memory.id, {
        date: trimmed === '' ? null : trimmed,
        lifeStageId: stage === '' ? null : stage,
        themes: [...chosen, ...newTheme.split(',')],
      });
      onDone(
        trimmed === ''
          ? `Saved ${title.trim()}. It has no date, so it sits on the Undated shelf.`
          : `Saved ${title.trim()}, ${formatDate(trimmed)}.`,
      );
    } catch {
      setError(SAVE_FAILED);
    }
  }

  return (
    <form
      className="grid gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
    >
      <DialogTitle>Edit {memory.title}</DialogTitle>
      <DialogDescription>
        The date places the memory on the track. Themes group it in By theme.
      </DialogDescription>
      <div className="grid gap-2">
        <Label htmlFor={titleId}>Title</Label>
        <Input
          id={titleId}
          value={title}
          onChange={(event) => {
            setTitle(event.target.value);
            setError(null);
          }}
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor={dateId}>Date</Label>
        <Input
          id={dateId}
          value={date}
          inputMode="numeric"
          placeholder="1994-07"
          aria-describedby={error === null ? dateHintId : `${dateHintId} ${errorId}`}
          aria-invalid={error !== null && date.trim() !== '' && !isDate(date.trim())}
          onChange={(event) => {
            setDate(event.target.value);
            setError(null);
          }}
        />
        <p id={dateHintId} className="text-sm text-muted">
          {DATE_HINT} Leave it empty for the Undated shelf.
        </p>
      </div>
      <div className="grid gap-2">
        <Label htmlFor={stageId}>Life stage</Label>
        <select
          id={stageId}
          value={stage}
          onChange={(event) => {
            setStage(event.target.value);
          }}
          className="min-h-11 rounded-md border border-rule bg-surface px-3 text-sm"
        >
          <option value="">None</option>
          {stages.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </div>
      <fieldset className="grid gap-2">
        <legend className="text-sm font-medium">Themes</legend>
        {offered.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {offered.map((theme) => (
              <button
                key={theme}
                type="button"
                aria-pressed={has(theme)}
                onClick={() => {
                  toggle(theme);
                }}
                className={cn(
                  'min-h-11 rounded-full border px-4 text-sm',
                  has(theme) ? 'border-text bg-text text-bg' : 'border-rule text-text hover:bg-surface',
                )}
              >
                {theme}
              </button>
            ))}
          </div>
        )}
        <Label htmlFor={themeId} className="font-normal">
          New themes, with commas between them
        </Label>
        <Input
          id={themeId}
          value={newTheme}
          placeholder="Food, the house on Elm Street"
          onChange={(event) => {
            setNewTheme(event.target.value);
          }}
        />
      </fieldset>
      {error !== null && (
        <p id={errorId} role="alert" className="text-sm text-accent-text">
          {error}
        </p>
      )}
      <div className="flex flex-wrap justify-end gap-2">
        <DialogClose asChild>
          <Button type="button" variant="ghost">
            Cancel
          </Button>
        </DialogClose>
        <Button type="submit">Save memory</Button>
      </div>
    </form>
  );
}

/** Add, rename, date, color, reorder and delete the life stages. */
export function LifeStagesDialog({
  open,
  projectId,
  stages,
  onClose,
  onSaved,
}: {
  open: boolean;
  projectId: string;
  stages: readonly LifeStage[];
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const [name, setName] = useState('');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [color, setColor] = useState('sage');
  const [error, setError] = useState<string | null>(null);
  const nameId = useId();
  const startId = useId();
  const endId = useId();

  async function add() {
    try {
      await addStage(projectId, { name, start, end, color });
      onSaved(`Added the life stage ${name.trim()}.`);
      setName('');
      setStart('');
      setEnd('');
      setError(null);
    } catch (reason) {
      setError(reason instanceof RangeError ? reason.message : SAVE_FAILED);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <div className="grid gap-4">
          <DialogTitle>Life stages</DialogTitle>
          <DialogDescription>
            A life stage is a stretch of years, such as childhood or the years in Lisbon. Each one is a
            colored band on the track. {DATE_HINT}
          </DialogDescription>
          {stages.length > 0 && (
            <ul aria-label="Life stages" className="grid gap-3">
              {stages.map((stage, index) => (
                <StageRow
                  key={stage.id}
                  stage={stage}
                  first={index === 0}
                  last={index === stages.length - 1}
                  onSaved={onSaved}
                />
              ))}
            </ul>
          )}
          <form
            className="grid gap-3 border-t border-rule pt-4"
            onSubmit={(event) => {
              event.preventDefault();
              void add();
            }}
          >
            <div className="grid gap-2">
              <Label htmlFor={nameId}>New life stage</Label>
              <Input
                id={nameId}
                value={name}
                placeholder="Childhood"
                onChange={(event) => {
                  setName(event.target.value);
                  setError(null);
                }}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-2">
                <Label htmlFor={startId}>Starts</Label>
                <Input
                  id={startId}
                  value={start}
                  inputMode="numeric"
                  placeholder="1988"
                  onChange={(event) => {
                    setStart(event.target.value);
                    setError(null);
                  }}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor={endId}>Ends</Label>
                <Input
                  id={endId}
                  value={end}
                  inputMode="numeric"
                  placeholder="1999"
                  onChange={(event) => {
                    setEnd(event.target.value);
                    setError(null);
                  }}
                />
              </div>
            </div>
            <ColorPicker legend="New life stage color" value={color} onChange={setColor} />
            {error !== null && (
              <p role="alert" className="text-sm text-accent-text">
                {error}
              </p>
            )}
            <div className="flex flex-wrap justify-end gap-2">
              <DialogClose asChild>
                <Button type="button" variant="ghost">
                  Done
                </Button>
              </DialogClose>
              <Button type="submit">Add life stage</Button>
            </div>
          </form>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function StageRow({
  stage,
  first,
  last,
  onSaved,
}: {
  stage: LifeStage;
  first: boolean;
  last: boolean;
  onSaved: (message: string) => void;
}) {
  const [name, setName] = useState(stage.name);
  const [start, setStart] = useState(stage.start);
  const [end, setEnd] = useState(stage.end);
  const [error, setError] = useState<string | null>(null);
  const nameId = useId();
  const startId = useId();
  const endId = useId();

  const save = (patch: { name?: string; start?: string; end?: string }) => {
    const changed =
      (patch.name !== undefined && patch.name.trim() !== stage.name) ||
      (patch.start !== undefined && patch.start.trim() !== stage.start) ||
      (patch.end !== undefined && patch.end.trim() !== stage.end);
    if (!changed) return;
    updateStage(stage.id, patch).then(
      () => {
        setError(null);
        onSaved(`Saved the life stage ${(patch.name ?? stage.name).trim()}.`);
      },
      (reason: unknown) => {
        setError(reason instanceof RangeError ? reason.message : SAVE_FAILED);
        setName(stage.name);
        setStart(stage.start);
        setEnd(stage.end);
      },
    );
  };
  const onEnter = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      event.currentTarget.blur();
    }
  };

  return (
    <li className="grid gap-3 rounded-md border border-rule p-3">
      <div className="flex flex-wrap items-end gap-2">
        <div className="grid min-w-0 flex-1 gap-1">
          <Label htmlFor={nameId}>
            Name<span className="sr-only"> of {stage.name}</span>
          </Label>
          <Input
            id={nameId}
            value={name}
            onChange={(event) => {
              setName(event.target.value);
            }}
            onBlur={() => {
              save({ name });
            }}
            onKeyDown={onEnter}
          />
        </div>
        <Button
          type="button"
          variant="ghost"
          className="min-w-11 px-0"
          aria-label={`Move ${stage.name} up`}
          disabled={first}
          onClick={() => {
            void moveStage(stage.id, -1).then(() => {
              onSaved(`Moved ${stage.name} up.`);
            });
          }}
        >
          <ArrowUp aria-hidden="true" className="size-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          className="min-w-11 px-0"
          aria-label={`Move ${stage.name} down`}
          disabled={last}
          onClick={() => {
            void moveStage(stage.id, 1).then(() => {
              onSaved(`Moved ${stage.name} down.`);
            });
          }}
        >
          <ArrowDown aria-hidden="true" className="size-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          aria-label={`Delete the life stage ${stage.name}`}
          onClick={() => {
            void deleteStage(stage.id).then(() => {
              onSaved(`Deleted the life stage ${stage.name}. Its memories keep their dates.`);
            });
          }}
        >
          Delete
        </Button>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="grid gap-1">
          <Label htmlFor={startId}>
            Starts<span className="sr-only">, {stage.name}</span>
          </Label>
          <Input
            id={startId}
            value={start}
            inputMode="numeric"
            onChange={(event) => {
              setStart(event.target.value);
            }}
            onBlur={() => {
              save({ start });
            }}
            onKeyDown={onEnter}
          />
        </div>
        <div className="grid gap-1">
          <Label htmlFor={endId}>
            Ends<span className="sr-only">, {stage.name}</span>
          </Label>
          <Input
            id={endId}
            value={end}
            inputMode="numeric"
            onChange={(event) => {
              setEnd(event.target.value);
            }}
            onBlur={() => {
              save({ end });
            }}
            onKeyDown={onEnter}
          />
        </div>
      </div>
      {error !== null && (
        <p role="alert" className="text-sm text-accent-text">
          {error}
        </p>
      )}
      <ColorPicker
        legend={`Color of ${stage.name}`}
        value={stage.color}
        onChange={(next) => {
          void updateStage(stage.id, { color: next });
        }}
      />
    </li>
  );
}
