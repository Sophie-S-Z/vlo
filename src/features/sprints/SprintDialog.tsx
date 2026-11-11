import { useId, useState } from 'react';
import { formatWords } from '@/features/library/format';
import { sharingReady } from '@/features/share/rpc';
import { MAX_GOAL } from '@/features/progress/progress';
import { Button } from '@/ui/button';
import { cn } from '@/ui/cn';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/ui/dialog';
import { Input } from '@/ui/input';
import { Label } from '@/ui/label';
import { Segmented } from '@/ui/segmented';
import { Switch } from '@/ui/switch';
import type { CountUnit } from '@/lib/wordcount';
import { createRoom, joinRoom, NICKNAME_MAX, roomMessage, type Room, type Standing } from './room';
import { Standings } from './RoomPanel';

/*
 * A sprint is a writing session with a word target (F60, plan Task K7). With a Supabase project, friends
 * can sprint together in a room. Only a nickname and a word count go to the room.
 */

export interface SprintStart {
  /** The minutes of the sprint, or null for a sprint with no time limit that ends at the target. */
  minutes: number | null;
  target: number;
  room?: Room;
}

const NICKNAME_KEY = 'vlo:sprint-nickname';
/** The Minutes value of a sprint with no time limit. */
const NO_LIMIT = 'none';
const number = new Intl.NumberFormat();

function savedNickname(): string {
  try {
    return localStorage.getItem(NICKNAME_KEY) ?? '';
  } catch {
    return '';
  }
}

export function SprintDialog({
  open,
  onOpenChange,
  lengths,
  unit,
  onStart,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lengths: readonly number[];
  unit: CountUnit;
  onStart: (sprint: SprintStart) => Promise<void>;
}) {
  const id = useId();
  const [minutes, setMinutes] = useState(String(lengths[0] ?? 15));
  const [target, setTarget] = useState('500');
  const [friends, setFriends] = useState(false);
  const [nickname, setNickname] = useState(savedNickname);
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const ready = sharingReady();

  const start = async () => {
    const words = Number(target.trim());
    if (!Number.isInteger(words) || words < 1 || words > MAX_GOAL) {
      setError(`Type a target from 1 to ${formatWords(MAX_GOAL, unit)}.`);
      return;
    }
    setBusy(true);
    setError('');
    try {
      let room: Room | undefined;
      if (ready && friends) {
        room = (await joinRoom(code.trim() === '' ? await createRoom() : code, nickname)).room;
        try {
          localStorage.setItem(NICKNAME_KEY, room.nickname);
        } catch {
          // The nickname is a convenience for next time.
        }
      }
      await onStart({
        minutes: minutes === NO_LIMIT ? null : Number(minutes),
        target: words,
        ...(room ? { room } : {}),
      });
      onOpenChange(false);
    } catch (problem) {
      setError(roomMessage(problem));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="grid gap-5">
        <div className="grid gap-1">
          <DialogTitle>Start a sprint</DialogTitle>
          <DialogDescription>
            Write to a target in a set time, or with no time limit until you reach it. Only the {unit} of the
            sprint count.
          </DialogDescription>
        </div>
        <form
          className="grid gap-5"
          onSubmit={(event) => {
            event.preventDefault();
            void start();
          }}
        >
          <div className="grid justify-items-start gap-1.5">
            {/* The group of buttons has the name, so a screen reader says it once. */}
            <span aria-hidden="true" className="text-sm font-medium">
              Minutes
            </span>
            <Segmented
              label="Minutes"
              options={[
                ...lengths.map((m) => ({ value: String(m), label: String(m) })),
                { value: NO_LIMIT, label: 'No limit' },
              ]}
              value={minutes}
              onChange={setMinutes}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor={`${id}-target`}>{unit === 'words' ? 'Word' : 'Character'} target</Label>
            <Input
              id={`${id}-target`}
              type="number"
              inputMode="numeric"
              required
              min={1}
              max={MAX_GOAL}
              className="max-w-40"
              value={target}
              onChange={(event) => {
                setTarget(event.target.value);
              }}
            />
          </div>
          {ready && (
            <div className="grid gap-3">
              <div className="flex items-center gap-3">
                <Switch id={`${id}-friends`} checked={friends} onCheckedChange={setFriends} />
                <Label htmlFor={`${id}-friends`}>Sprint with friends</Label>
              </div>
              {friends && (
                <>
                  <p className="text-sm text-muted">
                    The room gets your nickname and your count, never your text. A room ends after 24 hours.
                  </p>
                  <div className="grid gap-1.5">
                    <Label htmlFor={`${id}-nickname`}>Nickname</Label>
                    <Input
                      id={`${id}-nickname`}
                      required
                      maxLength={NICKNAME_MAX}
                      autoComplete="nickname"
                      value={nickname}
                      onChange={(event) => {
                        setNickname(event.target.value);
                      }}
                    />
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor={`${id}-code`}>Room code</Label>
                    <Input
                      id={`${id}-code`}
                      aria-describedby={`${id}-code-hint`}
                      autoComplete="off"
                      autoCapitalize="characters"
                      spellCheck={false}
                      maxLength={9}
                      className="max-w-40 uppercase"
                      value={code}
                      onChange={(event) => {
                        setCode(event.target.value);
                      }}
                    />
                    <p id={`${id}-code-hint`} className="text-sm text-muted">
                      Leave it empty to make a new room, then give its code to your friends.
                    </p>
                  </div>
                </>
              )}
            </div>
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
              {busy ? 'Starting the sprint' : 'Start the sprint'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export interface SprintOutcome {
  words: number;
  target: number;
  minutes: number;
  standings?: Standing[];
}

/** The result card at the end of a sprint. A met target gets one short pulse (plan Part J0). */
export function SprintResult({
  outcome,
  unit,
  onClose,
}: {
  outcome: SprintOutcome | null;
  unit: CountUnit;
  onClose: () => void;
}) {
  const met = outcome !== null && outcome.words >= outcome.target;
  return (
    <Dialog
      open={outcome !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="grid gap-4">
        <DialogTitle>Sprint result</DialogTitle>
        {outcome && (
          <>
            <DialogDescription>
              {met ? 'You reached your target.' : `Each of these ${unit} counts toward your goals too.`}
            </DialogDescription>
            <p
              className={cn('justify-self-start rounded-md px-1 tabular-nums', met && 'vlo-pulse')}
              data-testid="sprint-words"
            >
              <span className="font-display text-4xl font-semibold">{number.format(outcome.words)}</span> of{' '}
              {formatWords(outcome.target, unit)} in {outcome.minutes}{' '}
              {outcome.minutes === 1 ? 'minute' : 'minutes'}
            </p>
            {outcome.standings && outcome.standings.length > 0 && (
              <div className="grid gap-1">
                <p className="text-sm text-muted">The room:</p>
                <Standings standings={outcome.standings} />
              </div>
            )}
          </>
        )}
        <div className="flex justify-end">
          <Button type="button" onClick={onClose}>
            Done
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
