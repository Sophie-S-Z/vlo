import { useEffect, useId, useState } from 'react';
import { Button } from '@/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/ui/dialog';
import { Input } from '@/ui/input';
import { Label } from '@/ui/label';
import { PRESETS, type PresetId } from './engine/presets';
import {
  hasStoredKey,
  keepKeyForSession,
  MIN_PASSPHRASE,
  rememberKey,
  removeStoredKey,
  unlockKey,
} from './keys';
import { acceptTerms, TERMS, termsAccepted } from './terms';

/*
 * The key dialog (spec section 10, plan decision P6, US11). For a provider with a free tier, the data terms
 * come first in plain words, with a box to tick. The key stays in this tab unless the writer asks Vlo to
 * remember it, which needs a passphrase. A stored key unlocks with the same passphrase.
 */

export function KeyDialog({
  preset,
  open,
  onOpenChange,
  onReady,
}: {
  preset: PresetId;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Runs when the key is ready for this tab. */
  onReady: () => void;
}) {
  const id = useId();
  const info = PRESETS[preset];
  const terms = TERMS[preset];
  const [stored, setStored] = useState<boolean | null>(null);
  const [accepted, setAccepted] = useState<boolean | null>(null);
  const [tick, setTick] = useState(false);
  const [key, setKey] = useState('');
  const [remember, setRemember] = useState(false);
  const [passphrase, setPassphrase] = useState('');
  const [again, setAgain] = useState('');
  const [unlock, setUnlock] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    void Promise.all([hasStoredKey(preset), termsAccepted(preset)]).then(([s, a]) => {
      if (!live) return;
      setStored(s);
      setAccepted(a);
    });
    return () => {
      live = false;
    };
  }, [preset]);

  const done = () => {
    setBusy(false);
    onReady();
    onOpenChange(false);
  };

  const fail = (problem: unknown) => {
    setBusy(false);
    setError(problem instanceof Error ? problem.message : 'Vlo could not keep the key on this device.');
  };

  const save = async () => {
    setError('');
    if (accepted === false && !tick) {
      setError(`Tick the box to say that you read the terms of ${info.label}.`);
      return;
    }
    if (key.trim() === '') {
      setError('Paste a key first.');
      return;
    }
    if (remember && passphrase !== again) {
      setError('The two passphrases are not the same.');
      return;
    }
    setBusy(true);
    try {
      if (accepted === false) await acceptTerms(preset);
      if (remember) await rememberKey(preset, key, passphrase);
      else keepKeyForSession(preset, key);
      done();
    } catch (problem) {
      fail(problem);
    }
  };

  const open_ = async () => {
    setError('');
    setBusy(true);
    try {
      await unlockKey(preset, unlock);
      done();
    } catch (problem) {
      fail(problem);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <div className="grid gap-1">
          <DialogTitle>Key for {info.label}</DialogTitle>
          <DialogDescription>
            Vlo sends the key only to {new URL(info.base).host}, and never puts it in the network log.
          </DialogDescription>
        </div>

        {stored && (
          <form
            className="grid gap-2 rounded-[var(--radius-card)] border border-rule p-3"
            onSubmit={(event) => {
              event.preventDefault();
              event.stopPropagation();
              void open_();
            }}
          >
            <Label htmlFor={`${id}-unlock`}>Passphrase of the stored key</Label>
            <Input
              id={`${id}-unlock`}
              type="password"
              autoComplete="current-password"
              value={unlock}
              onChange={(event) => {
                setUnlock(event.target.value);
              }}
            />
            <div className="flex flex-wrap gap-2">
              <Button type="submit" disabled={busy}>
                Unlock the key
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  void removeStoredKey(preset).then(() => {
                    setStored(false);
                  }, fail);
                }}
              >
                Remove the stored key
              </Button>
            </div>
          </form>
        )}

        {accepted === false && terms && (
          <section aria-labelledby={`${id}-terms`} className="grid gap-2">
            <h3 id={`${id}-terms`} className="text-sm font-semibold">
              The data terms of {info.label}, in plain words
            </h3>
            <ul className="grid list-disc gap-1 pl-5 text-sm">
              {terms.points.map((point) => (
                <li key={point}>{point}</li>
              ))}
            </ul>
            <p className="text-sm">
              <a href={terms.link} target="_blank" rel="noreferrer" className="underline">
                Read the full terms of {info.label}
              </a>
            </p>
            <label className="flex min-h-11 items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={tick}
                onChange={(event) => {
                  setTick(event.target.checked);
                }}
                className="size-5 accent-[var(--accent)]"
              />
              I read these terms, and I agree to them for my text.
            </label>
          </section>
        )}

        <form
          className="grid gap-3"
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            // The dialog is a portal, so a submit would reach a form around it in the React tree.
            event.stopPropagation();
            void save();
          }}
        >
          <div className="grid gap-1.5">
            <Label htmlFor={`${id}-key`}>{stored ? 'Or paste a new key' : 'Key'}</Label>
            <Input
              id={`${id}-key`}
              type="password"
              autoComplete="off"
              spellCheck={false}
              value={key}
              onChange={(event) => {
                setKey(event.target.value);
              }}
            />
            {info.keyPage && (
              <p className="text-sm text-muted">
                Get a key at{' '}
                <a href={info.keyPage} target="_blank" rel="noreferrer" className="underline">
                  {new URL(info.keyPage).host}
                </a>
                .
              </p>
            )}
          </div>
          <label className="flex min-h-11 items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={remember}
              onChange={(event) => {
                setRemember(event.target.checked);
              }}
              className="size-5 accent-[var(--accent)]"
            />
            Remember on this device, locked with a passphrase
          </label>
          {remember ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="grid content-start gap-1.5">
                <Label htmlFor={`${id}-pass`}>Passphrase</Label>
                <Input
                  id={`${id}-pass`}
                  type="password"
                  autoComplete="new-password"
                  value={passphrase}
                  aria-describedby={`${id}-pass-hint`}
                  onChange={(event) => {
                    setPassphrase(event.target.value);
                  }}
                />
                <p id={`${id}-pass-hint`} className="text-xs text-muted">
                  At least {MIN_PASSPHRASE} characters. Vlo cannot find a lost passphrase.
                </p>
              </div>
              <div className="grid content-start gap-1.5">
                <Label htmlFor={`${id}-again`}>Passphrase again</Label>
                <Input
                  id={`${id}-again`}
                  type="password"
                  autoComplete="new-password"
                  value={again}
                  onChange={(event) => {
                    setAgain(event.target.value);
                  }}
                />
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted">
              The key stays in this tab only. Vlo forgets it when you close the tab.
            </p>
          )}
          <p role="alert" className="text-sm text-accent-text empty:hidden">
            {error}
          </p>
          <div className="flex flex-wrap justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                onOpenChange(false);
              }}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              Use this key
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
