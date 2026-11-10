import { useLiveQuery } from 'dexie-react-hooks';
import { useCallback, useEffect, useId, useState } from 'react';
import { sharingReady } from '@/features/share/rpc';
import { clock } from '@/lib/clock';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
} from '@/ui/alert-dialog';
import { Button } from '@/ui/button';
import { Input } from '@/ui/input';
import { Label } from '@/ui/label';
import { PairDialog } from './PairDialog';
import { leaveSync, listDevices, startSpace, stopSyncEverywhere, syncErrorText } from './pairing';
import { BLOCKED_TEXT, readSpace, syncedText, type SyncSpace } from './space';

/*
 * Devices in Settings (plan Task I7, roadmap F49): turn on sync, add a device, see each device, and stop.
 * The engine loads only when the writer syncs now, so Settings stays small.
 */

/** A name for a new device from the kind of browser, which the writer can change. */
export function guessDeviceName(agent = navigator.userAgent): string {
  if (/iPad|Tablet/i.test(agent)) return 'Tablet';
  if (/iPhone|Android|Mobile/i.test(agent)) return 'Phone';
  return 'Computer';
}

/** The field for this device's name, as the first device and the pair page ask for it. */
export function DeviceNameField({ value, onChange }: { value: string; onChange: (name: string) => void }) {
  const id = useId();
  return (
    <div className="grid max-w-sm gap-1.5">
      <Label htmlFor={id}>Name of this device</Label>
      <Input
        id={id}
        value={value}
        maxLength={40}
        onChange={(event) => {
          onChange(event.target.value);
        }}
      />
    </div>
  );
}

function StartSync({ onStarted, say }: { onStarted: () => void; say: (text: string) => void }) {
  const [name, setName] = useState(() => guessDeviceName());
  const [busy, setBusy] = useState(false);
  return (
    <div className="grid gap-3">
      <DeviceNameField value={name} onChange={setName} />
      <div>
        <Button
          type="button"
          disabled={busy}
          onClick={() => {
            setBusy(true);
            say('');
            startSpace(name).then(onStarted, (error: unknown) => {
              say(syncErrorText(error));
              setBusy(false);
            });
          }}
        >
          Sync my writing
        </Button>
      </div>
    </div>
  );
}

interface Device {
  device: string;
  updated_at: string;
}

interface SyncingProps {
  space: SyncSpace;
  pairing: boolean;
  onPairing: (open: boolean) => void;
  say: (text: string) => void;
}

function Syncing({ space, pairing, onPairing, say }: SyncingProps) {
  const [devices, setDevices] = useState<Device[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const now = clock.now();
  const { spaceId, token } = space;

  const loadDevices = useCallback(() => {
    listDevices({ spaceId, token }).then(setDevices, (error: unknown) => {
      say(syncErrorText(error));
    });
  }, [spaceId, token, say]);
  useEffect(loadDevices, [loadDevices]);

  async function act(task: () => Promise<string>) {
    setBusy(true);
    say('');
    try {
      say(await task());
    } catch (error) {
      say(syncErrorText(error));
    } finally {
      setBusy(false);
    }
  }

  const others = (devices ?? []).filter((d) => d.device !== space.deviceId);
  return (
    <div className="grid gap-4">
      {space.blocked && <p className="font-semibold">{BLOCKED_TEXT}</p>}
      <ul aria-label="Devices" className="grid gap-1">
        <li>
          <span className="font-medium">{space.deviceName} (this device)</span>{' '}
          <span className="text-muted">{syncedText(space.syncedAt, now)}</span>
        </li>
        {others.map((d) => (
          <li key={d.device}>
            <span className="font-medium">{space.names[d.device] ?? 'Another device'}</span>{' '}
            <span className="text-muted">{syncedText(Date.parse(d.updated_at), now)}</span>
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          disabled={busy}
          onClick={() => {
            void act(async () => {
              const { syncOnce } = await import('./engine');
              const result = await syncOnce();
              loadDevices();
              return result.blocked ? BLOCKED_TEXT : 'Synced.';
            });
          }}
        >
          Sync now
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            onPairing(true);
          }}
        >
          Add a device
        </Button>
      </div>
      <p className="text-sm text-muted">
        Anyone with the pairing link can read and change your projects until sync stops.
      </p>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          disabled={busy}
          onClick={() => {
            void act(async () => {
              await leaveSync(space);
              return 'Sync stopped on this device. Your projects stay here.';
            });
          }}
        >
          Stop sync on this device
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={busy}
          onClick={() => {
            setConfirming(true);
          }}
        >
          Stop sync on all devices
        </Button>
      </div>
      <PairDialog space={space} open={pairing} onOpenChange={onPairing} />
      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogTitle>Stop sync on all devices?</AlertDialogTitle>
          <AlertDialogDescription>
            The sync server deletes the sealed copies. Each device keeps its projects, and no device syncs.
          </AlertDialogDescription>
          <div className="flex flex-wrap justify-end gap-2">
            <AlertDialogCancel asChild>
              <Button variant="outline">Keep sync</Button>
            </AlertDialogCancel>
            <AlertDialogAction asChild>
              <Button
                onClick={() => {
                  void act(async () => {
                    await stopSyncEverywhere(space);
                    return 'Sync stopped on all devices. Your projects stay on each device.';
                  });
                }}
              >
                Stop sync
              </Button>
            </AlertDialogAction>
          </div>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export function DevicesSection() {
  const space = useLiveQuery(readSpace);
  const [pairing, setPairing] = useState(false);
  const [message, setMessage] = useState('');
  if (!sharingReady())
    return <p className="text-sm text-muted">Sync is not set up in this build, so Vlo sends nothing.</p>;
  if (space === undefined) return null;
  return (
    <div className="grid gap-3">
      <p className="text-muted">
        Sync keeps your projects the same on your phone and your computers, with no account. Vlo seals each
        project, text and research file with a key that only your devices have. The sync server keeps the
        sealed copies, and it cannot read a word, a title or a name. Snapshots, sound files, share links and
        settings stay on each device.
      </p>
      {space ? (
        <Syncing space={space} pairing={pairing} onPairing={setPairing} say={setMessage} />
      ) : (
        <StartSync
          say={setMessage}
          onStarted={() => {
            setPairing(true);
          }}
        />
      )}
      <p role="status" className="text-sm">
        {message}
      </p>
    </div>
  );
}
