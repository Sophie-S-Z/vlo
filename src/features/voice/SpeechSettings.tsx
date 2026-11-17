import { useEffect, useId, useState } from 'react';
import { Button } from '@/ui/button';
import { deleteNaturalVoices, deleteSpeechModels } from './deleteModels';
import { sizeOf } from './hosted';
import {
  getSpeechModel,
  modelReady,
  modelSize,
  setSpeechModel,
  SPEECH_MODELS,
  type SpeechModelId,
} from './model';
import { NATURAL_VOICES, voicesReady } from './natural';

/*
 * The speech models and the natural voices in Settings (roadmap F57, plan Task K9): the model that Speak
 * to write uses, what is on this device, and Delete.
 */

/** Null while Vlo looks, and in a browser with no Cache Storage. */
function useOnDevice(check: () => Promise<boolean>) {
  const [ready, setReady] = useState<boolean | null>(null);
  useEffect(() => {
    check().then(setReady, () => {
      setReady(null);
    });
  }, [check]);
  return [ready, setReady] as const;
}

const anyModel = async () => (await modelReady('small')) || (await modelReady('base'));

function DeleteRow({ ready, what, onDelete }: { ready: boolean | null; what: string; onDelete: () => void }) {
  if (ready === null) return null;
  if (!ready) return <p className="text-sm">The {what} are not on this device.</p>;
  return (
    <div className="flex flex-wrap items-center gap-3">
      <p className="text-sm">The {what} are on this device.</p>
      <Button variant="outline" onClick={onDelete}>
        Delete the {what}
      </Button>
    </div>
  );
}

export function SpeechSettings({ onAnnounce }: { onAnnounce: (text: string) => void }) {
  const name = useId();
  const [choice, setChoice] = useState<SpeechModelId>(getSpeechModel);
  const [ready, setReady] = useOnDevice(anyModel);
  const choices: readonly [SpeechModelId, string][] = [
    ['small', `${SPEECH_MODELS.small.name} (${modelSize('small')}): the most accurate.`],
    ['base', `${SPEECH_MODELS.base.name} (${modelSize('base')}): faster on an older phone or computer.`],
  ];
  return (
    <div className="grid gap-3">
      <p className="max-w-prose text-sm text-muted">
        Speak to write and Turn into text use a Whisper model. Vlo downloads it the first time that you use
        it. The model runs on this device, so your audio never leaves it.
      </p>
      <fieldset className="grid gap-2">
        <legend className="text-sm font-medium">Speech model</legend>
        {choices.map(([id, label]) => (
          <label key={id} className="flex min-h-11 items-center gap-2 text-sm pointer-fine:min-h-9">
            <input
              type="radio"
              name={name}
              checked={choice === id}
              onChange={() => {
                setSpeechModel(id);
                setChoice(id);
                onAnnounce(`Speak to write uses ${SPEECH_MODELS[id].name}.`);
              }}
              className="size-4 accent-[var(--accent)]"
            />
            {label}
          </label>
        ))}
      </fieldset>
      <DeleteRow
        ready={ready}
        what="speech models"
        onDelete={() => {
          deleteSpeechModels().then(
            () => {
              setReady(false);
              onAnnounce('Deleted the speech models.');
            },
            () => {
              onAnnounce('Vlo could not delete the speech models.');
            },
          );
        }}
      />
    </div>
  );
}

export function VoiceSettings({ onAnnounce }: { onAnnounce: (text: string) => void }) {
  const [ready, setReady] = useOnDevice(voicesReady);
  return (
    <div className="grid gap-3">
      <p className="max-w-prose text-sm text-muted">
        Read aloud has ten natural voices, five female and five male, in one download of{' '}
        {sizeOf(NATURAL_VOICES)}. Vlo downloads them the first time that you read with one. They run on this
        device, so your text never leaves it.
      </p>
      <DeleteRow
        ready={ready}
        what="natural voices"
        onDelete={() => {
          deleteNaturalVoices().then(
            () => {
              setReady(false);
              onAnnounce('Deleted the natural voices.');
            },
            () => {
              onAnnounce('Vlo could not delete the natural voices.');
            },
          );
        }}
      />
    </div>
  );
}
