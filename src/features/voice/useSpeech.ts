import type { Editor } from '@tiptap/core';
import { useEffect, useRef, useState } from 'react';
import { downloadModel, modelReady } from './model';
import { startRecording, type Recording } from './recorder';
import { insertDictation, transcribe } from './speech';

/*
 * The recorder and the speech-to-text steps that "Record a memory" (F57) and "Speak to write" (F62)
 * share. The audio stays on this device. The model downloads only after the writer agrees.
 */

function recordProblem(problem: unknown): string {
  if (problem instanceof DOMException && problem.name === 'NotAllowedError')
    return 'Vlo cannot use the microphone. Allow the microphone for this site in the browser settings, then try again.';
  if (typeof MediaRecorder === 'undefined') return 'This browser cannot record audio.';
  return 'Vlo could not start the recording. Check that a microphone is connected.';
}

/** A recording with a level from 0 to 1 and the seconds since it started, for the meter and the time. */
export function useRecorder() {
  const [recording, setRecording] = useState<Recording | null>(null);
  const [level, setLevel] = useState(0);
  const [seconds, setSeconds] = useState(0);
  const [problem, setProblem] = useState('');

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

  // A surface that closes during a recording drops it.
  const live = useRef(recording);
  useEffect(() => {
    live.current = recording;
  });
  useEffect(
    () => () => {
      live.current?.cancel();
    },
    [],
  );

  const record = async () => {
    setProblem('');
    setSeconds(0);
    try {
      setRecording(await startRecording());
    } catch (error) {
      setProblem(recordProblem(error));
    }
  };

  /** Ends the recording and gives its audio, or null when no recording runs. */
  const stop = async (): Promise<Blob | null> => {
    // The ref, not the state, so a second call before the next render finds no recording.
    const current = live.current;
    if (!current) return null;
    live.current = null;
    setRecording(null);
    setLevel(0);
    return current.stop();
  };

  return { recording: recording !== null, level, seconds, problem, setProblem, record, stop };
}

export type SpeechStep =
  | { step: 'idle' }
  | { step: 'ask'; audio: Blob }
  | { step: 'download'; share: number }
  | { step: 'working' }
  | { step: 'error'; message: string };

/**
 * Turns audio into text at the cursor. The first use asks before the model downloads. `onDone` runs
 * after the words go in.
 */
export function useSpeech(editor: Editor, language: string | undefined, onDone: () => void) {
  const [speech, setSpeech] = useState<SpeechStep>({ step: 'idle' });
  const stopDownload = useRef<AbortController | null>(null);

  // A surface that closes during a download stops it.
  useEffect(
    () => () => {
      stopDownload.current?.abort();
    },
    [],
  );

  const write = async (audio: Blob) => {
    setSpeech({ step: 'working' });
    try {
      const text = await transcribe(audio, language);
      if (text === '') {
        setSpeech({ step: 'error', message: 'Vlo found no words in this recording.' });
        return;
      }
      insertDictation(editor, text);
      setSpeech({ step: 'idle' });
      onDone();
    } catch {
      setSpeech({
        step: 'error',
        message:
          'Vlo could not turn this recording into text. Try again, or delete the model in Settings and download it again.',
      });
    }
  };

  /** Puts the words of `audio` at the cursor, or asks first when the model is not on this device. */
  const toText = async (audio: Blob) => {
    let ready: boolean;
    try {
      ready = await modelReady();
    } catch {
      setSpeech({ step: 'error', message: 'This browser cannot keep the speech model.' });
      return;
    }
    if (ready) await write(audio);
    else setSpeech({ step: 'ask', audio });
  };

  /** Downloads the model after the writer agreed, then turns the waiting audio into text. */
  const download = async () => {
    if (speech.step !== 'ask') return;
    const { audio } = speech;
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
    await write(audio);
  };

  return {
    speech,
    busy: speech.step === 'download' || speech.step === 'working',
    toText,
    download,
    cancel: () => {
      setSpeech({ step: 'idle' });
    },
    stopDownload: () => {
      stopDownload.current?.abort();
    },
  };
}
