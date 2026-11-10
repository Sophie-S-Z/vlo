import { useId, useState } from 'react';
import type { Project, Series } from '@/lib/db';
import { Button } from '@/ui/button';
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from '@/ui/dialog';
import { Input } from '@/ui/input';
import { Label } from '@/ui/label';
import { addToSeries, makeSeries, MAX_SERIES_TITLE } from './series';

/* "Add to a series" in the Library (F59): a new series with this book first, or the end of a series. */

const NEW = 'new';

export function SeriesDialog({
  project,
  series,
  onClose,
}: {
  project: Project | null;
  series: readonly Series[];
  onClose: () => void;
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
          <DialogTitle>Add to a series</DialogTitle>
          <DialogDescription>
            The books of a series share Codex entries and a style sheet. A book can be in one series.
          </DialogDescription>
          <SeriesForm key={project.id} project={project} series={series} onDone={onClose} />
        </DialogContent>
      )}
    </Dialog>
  );
}

function SeriesForm({
  project,
  series,
  onDone,
}: {
  project: Project;
  series: readonly Series[];
  onDone: () => void;
}) {
  const id = useId();
  const [choice, setChoice] = useState(series[0]?.id ?? NEW);
  const [title, setTitle] = useState('');
  const [error, setError] = useState('');
  const submit = async () => {
    try {
      if (choice === NEW) await makeSeries(title, [project.id]);
      else await addToSeries(choice, project.id);
      onDone();
    } catch (problem) {
      setError(
        problem instanceof RangeError ? problem.message : 'Vlo could not save the series on this device.',
      );
    }
  };
  return (
    <form
      className="grid gap-6"
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      {series.length > 0 && (
        <div className="grid gap-2">
          <Label htmlFor={`${id}-series`}>Series</Label>
          <select
            id={`${id}-series`}
            value={choice}
            onChange={(event) => {
              setChoice(event.target.value);
              setError('');
            }}
            className="min-h-11 rounded-md border border-rule bg-bg px-2 text-sm"
          >
            {series.map((s) => (
              <option key={s.id} value={s.id}>
                {s.title}
              </option>
            ))}
            <option value={NEW}>A new series</option>
          </select>
        </div>
      )}
      {choice === NEW && (
        <div className="grid gap-2">
          <Label htmlFor={`${id}-title`}>Title of the series</Label>
          <Input
            id={`${id}-title`}
            value={title}
            maxLength={MAX_SERIES_TITLE}
            autoComplete="off"
            onChange={(event) => {
              setTitle(event.target.value);
              setError('');
            }}
          />
        </div>
      )}
      {error && (
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
        <Button type="submit">{choice === NEW ? 'Make the series' : 'Add to the series'}</Button>
      </div>
    </form>
  );
}
