import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { Link } from 'react-router';
import { useDocumentTitle } from '@/app/useDocumentTitle';
import { sharingReady } from '@/features/share/rpc';
import { Button } from '@/ui/button';
import { DeviceNameField, guessDeviceName } from './DevicesSection';
import { BROKEN_LINK, joinSpace, readPairing, syncErrorText } from './pairing';
import { readSpace, type Pairing } from './space';

/*
 * The pair page (plan Task I7, decision R7). It takes the space from the link fragment once, and the
 * address bar loses the fragment at once, as the reader view does. A name and Start sync join the space.
 */

let taken: Pairing | Error | null = null;

function takePairing(): Pairing | Error {
  const { pathname, search, hash } = window.location;
  if (hash !== '') {
    try {
      taken = readPairing(hash);
    } catch (error) {
      taken = error as Error;
    }
    window.history.replaceState(window.history.state, '', `${pathname}${search}`);
  }
  return taken ?? new Error(BROKEN_LINK);
}

export function PairPage() {
  useDocumentTitle('Sync this device');
  const [pairing] = useState(takePairing);
  const space = useLiveQuery(readSpace);
  const [name, setName] = useState(() => guessDeviceName());
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  const library = (
    <Link to="/" className="underline">
      Go to the Library
    </Link>
  );
  let body: React.ReactNode;
  if (!sharingReady()) body = <p>Sync is not set up in this build.</p>;
  else if (pairing instanceof Error) body = <p>{pairing.message}</p>;
  else if (space === undefined) body = null;
  else if (space?.spaceId === pairing.spaceId)
    body = <p>This device syncs with your other devices now. Your projects come to the Library.</p>;
  else if (space)
    body = (
      <p>This device syncs with other devices already. To join this sync, stop sync in Settings first.</p>
    );
  else
    body = (
      <div className="grid gap-4">
        <p>
          Your projects from your other devices come to this device, and this device’s projects go to them.
          Vlo seals them first, so the sync server cannot read them.
        </p>
        <DeviceNameField value={name} onChange={setName} />
        <div>
          <Button
            type="button"
            disabled={busy}
            onClick={() => {
              setBusy(true);
              setMessage('');
              joinSpace(pairing, name).catch((error: unknown) => {
                setMessage(syncErrorText(error));
                setBusy(false);
              });
            }}
          >
            Start sync
          </Button>
        </div>
        <p role="status" className="text-sm">
          {message}
        </p>
      </div>
    );

  return (
    <div className="grid max-w-2xl gap-4">
      <h1 className="font-display text-4xl font-semibold">Sync this device</h1>
      {body}
      <p>{library}</p>
    </div>
  );
}
