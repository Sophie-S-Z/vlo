import { useId, useState } from 'react';
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
import { deleteItem, updateItem } from './items';

export type ItemAction = { type: 'rename' | 'synopsis' | 'delete'; item: Item; hasChildren: boolean } | null;

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
      <Dialog open={action?.type === 'rename' || action?.type === 'synopsis'} onOpenChange={close}>
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

function ItemForm({
  action,
  item,
  onDone,
}: {
  action: 'rename' | 'synopsis';
  item: Item;
  onDone: () => void;
}) {
  const [value, setValue] = useState(action === 'rename' ? item.title : (item.synopsis ?? ''));
  const [error, setError] = useState<string | null>(null);
  const fieldId = useId();
  const errorId = useId();

  async function submit() {
    if (action === 'rename' && value.trim() === '') {
      setError('An item needs a title.');
      return;
    }
    try {
      await updateItem(item.id, action === 'rename' ? { title: value } : { synopsis: value.trim() });
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
          {action === 'rename' ? `Rename ${item.title}` : `Synopsis for ${item.title}`}
        </DialogTitle>
        <DialogDescription>
          {action === 'rename' ? 'The new title shows in the binder.' : 'A line or two that sums it up.'}
        </DialogDescription>
      </div>
      <div className="grid gap-2">
        <Label htmlFor={fieldId}>{action === 'rename' ? 'Title' : 'Synopsis'}</Label>
        {action === 'rename' ? (
          <Input
            {...field}
            autoComplete="off"
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
