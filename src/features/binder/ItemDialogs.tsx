import { useId, useState } from 'react';
import { DATE_HINT, isDate } from '@/features/timeline/dates';
import type { Item } from '@/lib/db';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
} from '@/ui/alert-dialog';
import { Button } from '@/ui/button';
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from '@/ui/dialog';
import { Input } from '@/ui/input';
import { Label } from '@/ui/label';
import { Textarea } from '@/ui/textarea';
import { deleteItem, setStoryDate, updateItem } from './items';

export type FormAction = 'rename' | 'synopsis' | 'story-date';
export type ItemAction = { type: FormAction | 'delete'; item: Item; hasChildren: boolean } | null;

const FORM: Record<FormAction, { title: string; description: string; label: string }> = {
  rename: { title: 'Rename', description: 'The new title shows in the binder.', label: 'Title' },
  synopsis: { title: 'Synopsis for', description: 'A line or two that sums it up.', label: 'Synopsis' },
  'story-date': {
    title: 'Story date for',
    description: `When it happens in the story. ${DATE_HINT} Leave it empty for no date.`,
    label: 'Story date',
  },
};

const initial = (action: FormAction, item: Item) =>
  action === 'rename' ? item.title : ((action === 'synopsis' ? item.synopsis : item.storyDate) ?? '');

interface ItemDialogsProps {
  action: ItemAction;
  onClose: () => void;
  /** Called after a delete, so the binder can say what happened. */
  onDeleted: (item: Item) => void;
}

export function ItemDialogs({ action, onClose, onDeleted }: ItemDialogsProps) {
  const close = (open: boolean) => {
    if (!open) onClose();
  };
  return (
    <>
      <Dialog open={action !== null && action.type !== 'delete'} onOpenChange={close}>
        {action && action.type !== 'delete' && (
          <DialogContent>
            <ItemForm
              key={`${action.type}-${action.item.id}`}
              action={action.type}
              item={action.item}
              onDone={onClose}
            />
          </DialogContent>
        )}
      </Dialog>
      <AlertDialog open={action?.type === 'delete'} onOpenChange={close}>
        {action?.type === 'delete' && (
          <DeleteContent
            item={action.item}
            hasChildren={action.hasChildren}
            onClose={onClose}
            onDeleted={onDeleted}
          />
        )}
      </AlertDialog>
    </>
  );
}

function ItemForm({ action, item, onDone }: { action: FormAction; item: Item; onDone: () => void }) {
  const [value, setValue] = useState(initial(action, item));
  const [error, setError] = useState<string | null>(null);
  const fieldId = useId();
  const errorId = useId();

  async function submit() {
    const trimmed = value.trim();
    if (action === 'rename' && trimmed === '') {
      setError('An item needs a title.');
      return;
    }
    if (action === 'story-date' && trimmed !== '' && !isDate(trimmed)) {
      setError(`Vlo cannot read that date. ${DATE_HINT}`);
      return;
    }
    try {
      if (action === 'story-date') await setStoryDate(item.id, trimmed === '' ? null : trimmed);
      else await updateItem(item.id, action === 'rename' ? { title: value } : { synopsis: trimmed });
      onDone();
    } catch {
      setError('Vlo could not save this change on this device.');
    }
  }

  const field = {
    id: fieldId,
    value,
    'aria-invalid': error !== null,
    'aria-describedby': error === null ? undefined : errorId,
  };

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
      className="grid gap-6"
    >
      <div className="grid gap-2">
        <DialogTitle className="[overflow-wrap:anywhere]">
          {FORM[action].title} {item.title}
        </DialogTitle>
        <DialogDescription>{FORM[action].description}</DialogDescription>
      </div>
      <div className="grid gap-2">
        <Label htmlFor={fieldId}>{FORM[action].label}</Label>
        {action !== 'synopsis' ? (
          <Input
            {...field}
            autoComplete="off"
            inputMode={action === 'story-date' ? 'numeric' : undefined}
            placeholder={action === 'story-date' ? '1994-07' : undefined}
            onChange={(event) => {
              setValue(event.target.value);
              setError(null);
            }}
          />
        ) : (
          <Textarea
            {...field}
            onChange={(event) => {
              setValue(event.target.value);
              setError(null);
            }}
          />
        )}
        {error !== null && (
          <p id={errorId} role="alert" className="text-sm text-accent-text">
            {error}
          </p>
        )}
      </div>
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

function DeleteContent({
  item,
  hasChildren,
  onClose,
  onDeleted,
}: {
  item: Item;
  hasChildren: boolean;
  onClose: () => void;
  onDeleted: (item: Item) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    setBusy(true);
    try {
      await deleteItem(item.id);
      onDeleted(item);
      onClose();
    } catch {
      setError('Vlo could not delete this item. Reload Vlo and try again.');
      setBusy(false);
    }
  }

  return (
    <AlertDialogContent>
      <AlertDialogTitle className="[overflow-wrap:anywhere]">Delete {item.title}?</AlertDialogTitle>
      <AlertDialogDescription>
        {hasChildren
          ? 'This removes it and everything inside it from this device.'
          : 'This removes it from this device.'}
      </AlertDialogDescription>
      {error !== null && (
        <p role="alert" className="text-sm text-accent-text">
          {error}
        </p>
      )}
      <div className="flex flex-wrap justify-end gap-2">
        <AlertDialogCancel asChild>
          <Button variant="ghost">Cancel</Button>
        </AlertDialogCancel>
        <Button disabled={busy} onClick={() => void confirm()}>
          Delete item
        </Button>
      </div>
    </AlertDialogContent>
  );
}
