import { useId, useState } from 'react';
import { ShareError } from '@/features/share/rpc';
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
import { accountErrorText } from './AccountPage';
import { looksLikeEmail } from './auth';
import { addAccount, editAccount, removeAccount, type OwnerAccount } from './owner';

/*
 * The owner adds, changes and deletes accounts on the People view of the owner page (migration 0016). The
 * server does each change in the database and refuses any account that is not an owner.
 */

const errorText = (error: unknown) =>
  error instanceof ShareError && error.kind === 'taken' ? error.message : accountErrorText(error);
const GONE = 'This account is not on the server now. Choose Refresh.';

/** Adds an account when `account` is null, or changes the email and name of `account`. */
export function AccountDialog({
  account,
  onClose,
  onSaved,
}: {
  account: OwnerAccount | null;
  onClose: () => void;
  onSaved: (text: string) => void;
}) {
  const id = useId();
  const [email, setEmail] = useState(account?.email ?? '');
  const [name, setName] = useState(account?.name ?? '');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const google = account !== null && account.provider !== 'email';
  // The server keeps a name in each profile, so an account with a name keeps one.
  const needsName = Boolean(account?.name) && name.trim() === '';

  const save = async () => {
    setBusy(true);
    setMessage('');
    try {
      const clean = email.trim();
      const ok = account
        ? await editAccount(account.id, clean, name.trim())
        : Boolean(await addAccount(clean, name.trim()));
      if (ok) onSaved(account ? `Saved the changes to ${clean}.` : `Added ${clean}.`);
      else setMessage(GONE);
    } catch (error) {
      setMessage(errorText(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent>
        <DialogTitle>{account ? 'Edit this account' : 'Add an account'}</DialogTitle>
        <DialogDescription>
          {account
            ? 'A new email is the sign-in email from the next sign-in.'
            : 'The writer signs in with this email and a code that Vlo sends at that time. Vlo sends no email now.'}
        </DialogDescription>
        <form
          className="grid gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
        >
          <div className="grid gap-1.5">
            <label htmlFor={`${id}-email`} className="text-sm">
              Email
            </label>
            <Input
              id={`${id}-email`}
              type="email"
              autoComplete="off"
              maxLength={254}
              disabled={google}
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
              }}
            />
            {google && (
              <p className="text-sm text-muted">
                This account signs in with Google, so Google gives its email.
              </p>
            )}
          </div>
          <div className="grid gap-1.5">
            <label htmlFor={`${id}-name`} className="text-sm">
              {account?.name ? 'Name' : 'Name (you can leave it empty)'}
            </label>
            <Input
              id={`${id}-name`}
              autoComplete="off"
              maxLength={80}
              value={name}
              onChange={(e) => {
                setName(e.target.value);
              }}
            />
            {needsName && <p className="text-sm text-muted">Type a name. This account has a profile.</p>}
          </div>
          {message && (
            <p role="alert" className="text-sm text-accent-text">
              {message}
            </p>
          )}
          <div className="flex flex-wrap justify-end gap-2">
            <DialogClose asChild>
              <Button type="button" variant="ghost">
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" disabled={busy || !looksLikeEmail(email) || needsName}>
              {account ? 'Save' : 'Add the account'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Asks the owner to type the email, then deletes the account and all that the server keeps for it. */
export function DeleteAccountDialog({
  account,
  onClose,
  onDeleted,
}: {
  account: OwnerAccount;
  onClose: () => void;
  onDeleted: (text: string) => void;
}) {
  const id = useId();
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const matches = typed.trim().toLowerCase() === account.email.toLowerCase();

  const remove = async () => {
    setBusy(true);
    setMessage('');
    try {
      if (await removeAccount(account.id)) onDeleted(`Deleted ${account.email}.`);
      else setMessage(GONE);
    } catch (error) {
      setMessage(errorText(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AlertDialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <AlertDialogContent>
        <AlertDialogTitle className="[overflow-wrap:anywhere]">Delete {account.email}?</AlertDialogTitle>
        <AlertDialogDescription>
          The server deletes the account and all that it keeps for it: the sign-in, the profile with its
          photo, the settings, and the sync with every sealed copy. You cannot undo this.
        </AlertDialogDescription>
        <p className="text-sm">
          The projects stay on the writer&apos;s devices. The daily counts and the feedback stay, with no
          account. If the writer signs in with this email later, Vlo makes a new, empty account.
        </p>
        <div className="grid gap-1.5">
          <label htmlFor={id} className="text-sm">
            Type the email to confirm
          </label>
          <Input
            id={id}
            autoComplete="off"
            value={typed}
            onChange={(e) => {
              setTyped(e.target.value);
            }}
          />
        </div>
        {message && (
          <p role="alert" className="text-sm text-accent-text">
            {message}
          </p>
        )}
        <div className="flex flex-wrap justify-end gap-2">
          <AlertDialogCancel asChild>
            <Button variant="ghost">Keep the account</Button>
          </AlertDialogCancel>
          <Button
            disabled={busy || !matches}
            onClick={() => {
              void remove();
            }}
          >
            Delete the account
          </Button>
        </div>
      </AlertDialogContent>
    </AlertDialog>
  );
}
