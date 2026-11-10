import type { Editor } from '@tiptap/core';
import { useLiveQuery } from 'dexie-react-hooks';
import { Mic, Shuffle, Square } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { addRecording } from '@/features/research/research';
import { db, type ResearchFile } from '@/lib/db';
import { Button } from '@/ui/button';
import { downloadModel, MODEL_SIZE, modelReady } from './model';
import { PROMPTS } from './prompts';
import { startRecording, type Recording } from './recorder';
import { insertDictation, transcribe } from './speech';

/*
 * "Record a memory" (roadmap F57, plan Task K9, decision K4): a question card, a recorder with a level
 * meter, and the saved recordings of the memory. "Turn into text" runs the speech model on this device and
 * puts the words in at the cursor.
 */

const QUESTIONS = PROMPTS.flatMap(({ stage, questions }) =>
  questions.map((question) => ({ stage, question })),
);

type Speech =
  | { step: 'idle' }
  | { step: 'ask'; clip: ResearchFile }
  | { step: 'download'; share: number }
  | { step: 'working' }
  | { step: 'error'; message: string };

const clock = (seconds: number) =>
  `${String(Math.floor(seconds / 60))}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;

function recordProblem(problem: unknown): string {
  if (problem instanceof DOMException && problem.name === 'NotAllowedError')
    return 'Vlo cannot use the microphone. Allow the microphone for this site in the browser settings, then try again.';
  if (typeof MediaRecorder === 'undefined') return 'This browser cannot record audio.';
  return 'Vlo could not start the recording. Check that a microphone is connected.';
}

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
  const [recording, setRecording] = useState<Recording | null>(null);
  const [level, setLevel] = useState(0);
  const [seconds, setSeconds] = useState(0);
  const [problem, setProblem] = useState('');
  const [speech, setSpeech] = useState<Speech>({ step: 'idle' });
  const stopDownload = useRef<AbortController | null>(null);
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

  // The meter and the time follow the recording on each frame.
  useEffect(() => {
    if (!recording) return;
    const started = performance.now();
    let frame = requestAnimationFrame(function tick() {
      setLevel(recording.level());
      setSeconds((performance.now() - started) / 1000);
      frame = requestAnimationFrame(tick);
    });
    return () => {
      cancelAnimationFrame(frame);
    };
  }, [recording]);

  // A dialog that closes during a recording or a download stops it.
  const live = useRef({ recording, stopDownload });
  useEffect(() => {
    live.current = { recording, stopDownload };
  });
  useEffect(
    () => () => {
      live.current.recording?.cancel();
      live.current.stopDownload.current?.abort();
    },
    [],
  );

  const record = async () => {
    setProblem('');
    try {
      setRecording(await startRecording());
    } catch (error) {
      setProblem(recordProblem(error));
    }
  };

  const stop = async () => {
    if (!recording) return;
    setRecording(null);
    setLevel(0);
    const audio = await recording.stop();
    await addRecording(projectId, itemId, audio, current?.question ?? 'Recording').catch(() => {
      setProblem('Vlo could not save the recording on this device.');
    });
  };

  const toText = async (clip: ResearchFile) => {
    if (!clip.data) return;
    setSpeech({ step: 'working' });
    try {
      const text = await transcribe(clip.data, language);
      if (text === '') {
        setSpeech({ step: 'error', message: 'Vlo found no words in this recording.' });
        return;
      }
      insertDictation(editor, text);
      onDone();
    } catch {
      setSpeech({
        step: 'error',
        message:
          'Vlo could not turn this recording into text. Try again, or delete the model in Settings and download it again.',
      });
    }
  };

  const download = async (clip: ResearchFile) => {
    const controller = new AbortController();
    stopDownload.current = controller;
    setSpeech({ step: 'download', share: 0 });
    try {
      await downloadModel((share) => {
        setSpeech({ step: 'download', share });
      }, controller.signal);
    } catch {
      setSpeech(
        controller.signal.aborted
          ? { step: 'idle' }
          : { step: 'error', message: 'The download stopped. Check the connection and try again.' },
      );
      return;
    } finally {
      stopDownload.current = null;
    }
    await toText(clip);
  };

  const busy = recording !== null || speech.step === 'download' || speech.step === 'working';

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
            disabled={recording !== null}
            onClick={() => {
              setIndex((i) => (i + 1) % QUESTIONS.length);
            }}
          >
            Next
          </Button>
          <Button
            variant="ghost"
            disabled={recording !== null}
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
            <Button disabled={busy} onClick={() => void record()}>
              <Mic aria-hidden="true" className="size-4" />
              Record
            </Button>
          )}
          <p role="status" className="text-sm text-muted tabular-nums">
            {recording ? `Recording, ${clock(seconds)}` : ''}
          </p>
        </div>
        <div aria-hidden="true" className="h-2 max-w-xs overflow-hidden rounded-full bg-rule">
          <div
            className="h-full origin-left rounded-full bg-accent"
            style={{ transform: `scaleX(${String(level)})` }}
          />
        </div>
        <p className="text-sm text-muted">
          The audio stays on this device, with the research files of this memory.
        </p>
        {problem && (
          <p role="alert" className="text-sm text-accent-text">
            {problem}
          </p>
        )}
      </section>

      {speech.step === 'ask' && (
        <section
          aria-label="Download the speech model"
          className="grid gap-3 rounded-[var(--radius-card)] border border-accent p-4"
        >
          <p className="text-sm">
            To turn speech into text, Vlo downloads the Whisper base model once ({MODEL_SIZE}) from Hugging
            Face. Then the model runs on this device, and the audio never leaves it. You can delete the model
            in Settings.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => void download(speech.clip)}>Download {MODEL_SIZE}</Button>
            <Button
              variant="ghost"
              onClick={() => {
                setSpeech({ step: 'idle' });
              }}
            >
              Cancel
            </Button>
          </div>
        </section>
      )}
      <div
        className={
          speech.step === 'download' || speech.step === 'working' || speech.step === 'error'
            ? 'grid gap-2'
            : 'sr-only'
        }
      >
        <p role="status" className="text-sm text-muted">
          {speech.step === 'download' &&
            `Downloading the speech model: ${String(Math.floor(speech.share * 100))}%.`}
          {speech.step === 'working' &&
            'Turning the recording into text. A long recording takes a minute or more.'}
        </p>
        {speech.step === 'download' && (
          <Button
            variant="ghost"
            className="justify-self-start"
            onClick={() => {
              stopDownload.current?.abort();
            }}
          >
            Stop the download
          </Button>
        )}
        {speech.step === 'error' && (
          <p role="alert" className="text-sm text-accent-text">
            {speech.message}
          </p>
        )}
      </div>

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
                  modelReady().then(
                    (ready) => {
                      if (ready) void toText(target);
                      else setSpeech({ step: 'ask', clip: target });
                    },
                    () => {
                      setSpeech({ step: 'error', message: 'This browser cannot keep the speech model.' });
                    },
                  );
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
