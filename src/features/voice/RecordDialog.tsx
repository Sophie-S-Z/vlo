import type { Editor } from '@tiptap/core';
import { useLiveQuery } from 'dexie-react-hooks';
import { Mic, Shuffle, Square } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { addRecording } from '@/features/research/research';
import { db, type ResearchFile } from '@/lib/db';
import { Button } from '@/ui/button';
import { PROMPTS } from './prompts';
import { clock, LevelMeter, SpeechStatus } from './SpeechParts';
import { useRecorder, useSpeech } from './useSpeech';

/*
 * "Record a memory" (roadmap F57, plan Task K9, decision K4): a question card, a recorder with a level
 * meter, and the saved recordings of the memory. "Turn into text" runs the speech model on this device and
 * puts the words in at the cursor.
 */

const QUESTIONS = PROMPTS.flatMap(({ stage, questions }) =>
  questions.map((question) => ({ stage, question })),
);

function Clip({
  clip,
  busy,
  onText,
}: {
  clip: ResearchFile;
  busy: boolean;
  onText: (clip: ResearchFile) => void;
}) {
  const url = useMemo(() => (clip.data ? URL.createObjectURL(clip.data) : null), [clip.data]);
  useEffect(
    () => () => {
      if (url) URL.revokeObjectURL(url);
    },
    [url],
  );
  return (
    <li className="grid gap-2 rounded-md border border-rule p-3">
      <p className="text-sm [overflow-wrap:anywhere]">{clip.name}</p>
      {url && (
        // A recording of the writer's own voice has no captions.
        // eslint-disable-next-line jsx-a11y/media-has-caption
        <audio controls src={url} className="w-full" aria-label={`Play ${clip.name}`} />
      )}
      <Button
        variant="outline"
        className="justify-self-start"
        disabled={busy}
        onClick={() => {
          onText(clip);
        }}
      >
        Turn into text
      </Button>
    </li>
  );
}

export function RecordDialog({
  editor,
  projectId,
  itemId,
  language,
  onDone,
}: {
  editor: Editor;
  projectId: string;
  itemId: string;
  language: string | undefined;
  /** Closes the dialog after the text goes in. */
  onDone: () => void;
}) {
  const [index, setIndex] = useState(0);
  const recorder = useRecorder();
  const speech = useSpeech(editor, language, onDone);
  const clips = useLiveQuery(
    () =>
      db.research
        .where('projectId')
        .equals(projectId)
        .filter((file) => file.itemId === itemId)
        .sortBy('addedAt'),
    [projectId, itemId],
  );
  const current = QUESTIONS[index] ?? QUESTIONS[0];
  const { recording, setProblem } = recorder;

  const stop = async () => {
    const audio = await recorder.stop();
    if (!audio) return;
    await addRecording(projectId, itemId, audio, current?.question ?? 'Recording').catch(() => {
      setProblem('Vlo could not save the recording on this device.');
    });
  };

  const busy = recording || speech.busy;

  return (
    <div className="grid gap-6">
      <section
        aria-label="Question"
        className="grid gap-3 rounded-[var(--radius-card)] border border-rule bg-surface p-4"
      >
        <p className="text-sm text-muted">
          {current?.stage}, question {String(index + 1)} of {String(QUESTIONS.length)}
        </p>
        <p aria-live="polite" className="font-manuscript text-xl">
          {current?.question}
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            disabled={recording}
            onClick={() => {
              setIndex((i) => (i + 1) % QUESTIONS.length);
            }}
          >
            Next
          </Button>
          <Button
            variant="ghost"
            disabled={recording}
            onClick={() => {
              // Another question, never the same one again.
              const step = 1 + Math.floor(Math.random() * (QUESTIONS.length - 1));
              setIndex((i) => (i + step) % QUESTIONS.length);
            }}
          >
            <Shuffle aria-hidden="true" className="size-4" />
            Shuffle
          </Button>
        </div>
      </section>

      <section aria-label="Recorder" className="grid gap-3">
        <div className="flex flex-wrap items-center gap-3">
          {recording ? (
            <Button onClick={() => void stop()}>
              <Square aria-hidden="true" className="size-4" />
              Stop
            </Button>
          ) : (
            <Button disabled={busy} onClick={() => void recorder.record()}>
              <Mic aria-hidden="true" className="size-4" />
              Record
            </Button>
          )}
          <p role="status" className="text-sm text-muted tabular-nums">
            {recording ? `Recording, ${clock(recorder.seconds)}` : ''}
          </p>
        </div>
        <LevelMeter level={recorder.level} />
        <p className="text-sm text-muted">
          The audio stays on this device, with the research files of this memory.
        </p>
        {recorder.problem && (
          <p role="alert" className="text-sm text-accent-text">
            {recorder.problem}
          </p>
        )}
      </section>

      <SpeechStatus speech={speech} />

      <section aria-labelledby="record-clips" className="grid gap-2">
        <h3 id="record-clips" className="text-base font-semibold">
          Recordings of this memory
        </h3>
        {clips && clips.length > 0 ? (
          <ul className="grid gap-2">
            {clips.map((clip) => (
              <Clip
                key={clip.id}
                clip={clip}
                busy={busy}
                onText={(target) => {
                  if (target.data) void speech.toText(target.data);
                }}
              />
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted">No recordings yet.</p>
        )}
      </section>
    </div>
  );
}
