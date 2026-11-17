import { Button } from '@/ui/button';
import { modelSize, SPEECH_MODELS, type SpeechModelId } from './model';
import type { SpeechStep } from './useSpeech';

/* The level meter and the speech-to-text status that "Record a memory" and "Speak to write" share. */

export const clock = (seconds: number) =>
  `${String(Math.floor(seconds / 60))}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;

export function LevelMeter({ level }: { level: number }) {
  return (
    <div aria-hidden="true" className="h-2 max-w-xs overflow-hidden rounded-full bg-rule">
      <div
        className="h-full origin-left rounded-full bg-accent"
        style={{ transform: `scaleX(${String(level)})` }}
      />
    </div>
  );
}

/** The model question, the download and its progress, the work, and any error. */
export function SpeechStatus({
  speech,
}: {
  speech: {
    speech: SpeechStep;
    download: (id: SpeechModelId) => Promise<void>;
    cancel: () => void;
    stopDownload: () => void;
  };
}) {
  const { speech: state } = speech;
  return (
    <>
      {state.step === 'ask' && (
        <section
          aria-label="Download the speech model"
          className="grid gap-3 rounded-[var(--radius-card)] border border-accent p-4"
        >
          <p className="text-sm">
            To turn speech into text, Vlo downloads a speech model once from Hugging Face. Then the model runs
            on this device, and the audio never leaves it. {SPEECH_MODELS.small.name} ({modelSize('small')})
            makes the fewest mistakes. {SPEECH_MODELS.base.name} ({modelSize('base')}) is faster on an older
            phone. You can change the model or delete it in Settings.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => void speech.download('small')}>
              Download the accurate model ({modelSize('small')})
            </Button>
            <Button variant="outline" onClick={() => void speech.download('base')}>
              Download the fast model ({modelSize('base')})
            </Button>
            <Button variant="ghost" onClick={speech.cancel}>
              Cancel
            </Button>
          </div>
        </section>
      )}
      <div
        className={
          state.step === 'download' || state.step === 'working' || state.step === 'error'
            ? 'grid gap-2'
            : 'sr-only'
        }
      >
        <p role="status" className="text-sm text-muted">
          {state.step === 'download' &&
            `Downloading the speech model: ${String(Math.floor(state.share * 100))}%.`}
          {state.step === 'working' &&
            'Turning the recording into text. A long recording takes a minute or more.'}
        </p>
        {state.step === 'download' && (
          <Button variant="ghost" className="justify-self-start" onClick={speech.stopDownload}>
            Stop the download
          </Button>
        )}
        {state.step === 'error' && (
          <p role="alert" className="text-sm text-accent-text">
            {state.message}
          </p>
        )}
      </div>
    </>
  );
}
