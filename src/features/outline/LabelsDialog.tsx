import { Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { BOARD_COLORS } from '@/features/board/board';
import { newId } from '@/lib/ids';
import { MAX_LABELS, type Label, type Project } from '@/lib/db';
import { Button } from '@/ui/button';
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from '@/ui/dialog';
import { Input } from '@/ui/input';
import { saveLabels } from './outline';

/* The project's labels (roadmap F40, plan Task H1): a name and a color each, at most `MAX_LABELS`. */

export function LabelsDialog({
  project,
  onClose,
  onSaved,
}: {
  project: Project | null;
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  return (
    <Dialog
      open={project !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      {project !== null && (
        <DialogContent>
          <DialogTitle>Labels</DialogTitle>
          <DialogDescription>
            Give items a label, such as “Needs research”. A deleted label leaves its items with none.
          </DialogDescription>
          <LabelsForm
            project={project}
            onDone={(message) => {
              onSaved(message);
              onClose();
            }}
          />
        </DialogContent>
      )}
    </Dialog>
  );
}

function LabelsForm({ project, onDone }: { project: Project; onDone: (message: string) => void }) {
  const [labels, setLabels] = useState<Label[]>(project.settings.labels ?? []);
  const [error, setError] = useState('');
  const change = (index: number, patch: Partial<Label>) => {
    setLabels((now) => now.map((l, i) => (i === index ? { ...l, ...patch } : l)));
    setError('');
  };

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        const clean = labels.map((l) => ({ ...l, name: l.name.trim() }));
        if (clean.some((l) => l.name === '')) {
          setError('Each label needs a name.');
          return;
        }
        saveLabels(project.id, clean).then(
          () => {
            onDone('Saved the labels.');
          },
          () => {
            setError('Vlo could not save the labels on this device.');
          },
        );
      }}
      className="grid gap-4"
    >
      {labels.length === 0 ? (
        <p className="text-sm text-muted">This project has no labels yet.</p>
      ) : (
        <ul className="grid gap-2">
          {labels.map((label, index) => (
            <li key={label.id} className="flex items-center gap-2">
              <Input
                aria-label={`Name of label ${String(index + 1)}`}
                value={label.name}
                maxLength={40}
                onChange={(event) => {
                  change(index, { name: event.target.value });
                }}
                autoComplete="off"
              />
              <select
                aria-label={`Color of label ${String(index + 1)}`}
                value={label.color}
                onChange={(event) => {
                  change(index, { color: event.target.value });
                }}
                className="min-h-11 rounded-md border border-rule bg-bg px-2 text-sm"
              >
                {BOARD_COLORS.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>
              <Button
                type="button"
                variant="ghost"
                aria-label={`Delete label ${label.name.trim() || String(index + 1)}`}
                className="min-w-11 px-0"
                onClick={() => {
                  setLabels((now) => now.filter((_, i) => i !== index));
                }}
              >
                <Trash2 aria-hidden="true" className="size-4" />
              </Button>
            </li>
          ))}
        </ul>
      )}
      <Button
        type="button"
        variant="outline"
        className="justify-self-start"
        disabled={labels.length >= MAX_LABELS}
        onClick={() => {
          setLabels((now) => [
            ...now,
            { id: newId(), name: '', color: BOARD_COLORS[1 + (now.length % 5)]?.id ?? 'amber' },
          ]);
        }}
      >
        <Plus aria-hidden="true" className="size-4" />
        Add a label
      </Button>
      {labels.length >= MAX_LABELS && (
        <p className="text-sm text-muted">A project can have {MAX_LABELS} labels.</p>
      )}
      {error !== '' && (
        <p role="alert" className="text-sm text-accent-text">
          {error}
        </p>
      )}
      <div className="flex flex-wrap justify-end gap-2">
        <DialogClose asChild>
          <Button type="button" variant="ghost">
            Cancel
          </Button>
        </DialogClose>
        <Button type="submit">Save</Button>
      </div>
    </form>
  );
}
