import { useEffect, useState } from 'react';
import { Button } from '@/ui/button';
import { deleteModel, MODEL_SIZE, modelReady } from './model';

/* The speech model in Settings (roadmap F57, plan Task K9): whether it is on this device, and Delete. */

export function SpeechSettings({ onAnnounce }: { onAnnounce: (text: string) => void }) {
  // Null while Vlo looks, and in a browser with no Cache Storage.
  const [ready, setReady] = useState<boolean | null>(null);
  useEffect(() => {
    modelReady().then(setReady, () => {
      setReady(null);
    });
  }, []);
  return (
    <div className="grid gap-3">
      <p className="max-w-prose text-sm text-muted">
        Turn into text in Record a memory uses the Whisper base model ({MODEL_SIZE}). Vlo downloads it the
        first time that you use it. The model runs on this device, so your audio never leaves it.
      </p>
      {ready === true && (
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-sm">The speech model is on this device.</p>
          <Button
            variant="outline"
            onClick={() => {
              deleteModel().then(
                () => {
                  setReady(false);
                  onAnnounce('Deleted the speech model.');
                },
                () => {
                  onAnnounce('Vlo could not delete the speech model.');
                },
              );
            }}
          >
            Delete the model
          </Button>
        </div>
      )}
      {ready === false && <p className="text-sm">The speech model is not on this device.</p>}
    </div>
  );
}
