import type { Editor } from '@tiptap/core';
import { useEffect, useRef, useState } from 'react';
import { startListening, type Listening } from './listen';
import { downloadModel, getSpeechModel, modelReady, setSpeechModel, type SpeechModelId } from './model';
import { startRecording, type Recording } from './recorder';
import { insertDictation, transcribe } from './speech';

/*
 * The recorder and the speech-to-text steps of "Record a memory" (F57) and "Speak to write" (F62). The
 * audio stays on this device. A model downloads only after the writer agrees.
 */

function recordProblem(problem: unknown): string {
  if (problem instanceof DOMException && problem.name === 'NotAllowedError')
    return 'Vlo cannot use the microphone. Allow the microphone for this site in the browser settings, then try again.';
  if (typeof MediaRecorder === 'undefined' || typeof AudioWorkletNode === 'undefined')
    return 'This browser cannot record audio.';
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
  const mounted = useRef(true);
  useEffect(() => {
    live.current = recording;
  });
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      live.current?.cancel();
    };
  }, []);

  const record = async () => {
    setProblem('');
    setSeconds(0);
    try {
      const started = await startRecording();
      // A surface that closed while the browser asked for the microphone does not record.
      if (!mounted.current) {
        started.cancel();
        return;
      }
      setRecording(started);
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
  | { step: 'ask' }
  | { step: 'download'; share: number }
  | { step: 'working' }
  | { step: 'error'; message: string };

const FAILED =
  'Vlo could not turn your speech into text. Try again, or delete the models in Settings and download one again.';

/**
 * The model question and the download that both surfaces share. `ensure` gives the writer's model when it
 * is on this device, else asks. `download` gets the model that the writer picked, then runs `then`.
 */
function useModel() {
  const [speech, setSpeech] = useState<SpeechStep>({ step: 'idle' });
  const stopDownload = useRef<AbortController | null>(null);

  // A surface that closes during a download stops it.
  useEffect(
    () => () => {
      stopDownload.current?.abort();
    },
    [],
  );

  const ensure = async (): Promise<SpeechModelId | null> => {
    const model = getSpeechModel();
    try {
      if (await modelReady(model)) return model;
      setSpeech({ step: 'ask' });
    } catch {
      setSpeech({ step: 'error', message: 'This browser cannot keep the speech model.' });
    }
    return null;
  };

  const download = async (model: SpeechModelId): Promise<boolean> => {
    setSpeechModel(model);
    const controller = new AbortController();
    stopDownload.current = controller;
    setSpeech({ step: 'download', share: 0 });
    try {
      await downloadModel(
        model,
        (share) => {
          setSpeech({ step: 'download', share });
        },
        controller.signal,
      );
      return true;
    } catch {
      setSpeech(
        controller.signal.aborted
          ? { step: 'idle' }
          : { step: 'error', message: 'The download stopped. Check the connection and try again.' },
      );
      return false;
    } finally {
      stopDownload.current = null;
    }
  };

  return {
    speech,
    setSpeech,
    ensure,
    download,
    cancel: () => {
      setSpeech({ step: 'idle' });
    },
    stopDownload: () => {
      stopDownload.current?.abort();
    },
  };
}

/**
 * Turns a recording into text at the cursor ("Record a memory"). The first use asks before the model
 * downloads. `onDone` runs after the words go in.
 */
export function useSpeech(editor: Editor, language: string | undefined, onDone: () => void) {
  const model = useModel();
  const { setSpeech } = model;
  const waiting = useRef<Blob | null>(null);

  const write = async (audio: Blob, id: SpeechModelId) => {
    setSpeech({ step: 'working' });
    try {
      const text = await transcribe(audio, id, language);
      if (text === '') {
        setSpeech({ step: 'error', message: 'Vlo found no words in this recording.' });
        return;
      }
      insertDictation(editor, text);
      setSpeech({ step: 'idle' });
      onDone();
    } catch {
      setSpeech({ step: 'error', message: FAILED });
    }
  };

  return {
    ...model,
    busy: model.speech.step === 'download' || model.speech.step === 'working',
    /** Puts the words of `audio` at the cursor, or asks first when the model is not on this device. */
    toText: async (audio: Blob) => {
      waiting.current = audio;
      const id = await model.ensure();
      if (id) await write(audio, id);
    },
    /** Downloads the model that the writer picked, then turns the waiting audio into text. */
    download: async (id: SpeechModelId) => {
      const audio = waiting.current;
      if (audio && (await model.download(id))) await write(audio, id);
    },
  };
}

/**
 * Live dictation ("Speak to write"): the words of each clip go in at the cursor while the writer speaks.
 * There is no time limit. Stop writes the last words, then `onDone` runs. A panel that closes stops too, and
 * its last words still go in.
 */
export function useDictation(editor: Editor, language: string | undefined, onDone: () => void) {
  const model = useModel();
  const { setSpeech } = model;
  const [listening, setListening] = useState<Listening | null>(null);
  const [stopping, setStopping] = useState(false);
  const [problem, setProblem] = useState('');
  const [level, setLevel] = useState(0);
  const [seconds, setSeconds] = useState(0);
  const live = useRef<Listening | null>(null);
  const mounted = useRef(true);

  // The meter and the time follow the listening on each frame.
  useEffect(() => {
    if (!listening) return;
    const started = performance.now();
    let frame = requestAnimationFrame(function tick() {
      setLevel(listening.level());
      setSeconds((performance.now() - started) / 1000);
      frame = requestAnimationFrame(tick);
    });
    return () => {
      cancelAnimationFrame(frame);
    };
  }, [listening]);

  /** Ends the listening and writes the last words. */
  const stop = async () => {
    const current = live.current;
    if (!current) return;
    live.current = null;
    setListening(null);
    setLevel(0);
    setStopping(true);
    try {
      await current.stop();
      if (mounted.current) onDone();
    } catch {
      setSpeech({ step: 'error', message: FAILED });
    } finally {
      setStopping(false);
    }
  };

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      void stop();
    };
    // `stop` reads only refs and state setters, so the first one serves for the unmount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const listen = async (id: SpeechModelId) => {
    setProblem('');
    setSeconds(0);
    try {
      const started = await startListening(async (samples) => {
        try {
          const text = await transcribe(samples, id, language);
          insertDictation(editor, text, false);
        } catch (failure) {
          // The model failed, so listening on helps no one.
          setSpeech({ step: 'error', message: FAILED });
          void stop();
          throw failure;
        }
      });
      // A panel that closed while the browser asked for the microphone does not listen.
      if (!mounted.current) {
        void started.stop();
        return;
      }
      live.current = started;
      setListening(started);
    } catch (error) {
      setProblem(recordProblem(error));
    }
  };

  return {
    ...model,
    listening: listening !== null,
    stopping,
    problem,
    level,
    seconds,
    busy: listening !== null || stopping || model.speech.step === 'download',
    /** Starts to listen, or asks first when the model is not on this device. */
    start: async () => {
      setSpeech({ step: 'idle' });
      const id = await model.ensure();
      if (id) await listen(id);
    },
    stop,
    /** Downloads the model that the writer picked, then starts to listen. */
    download: async (id: SpeechModelId) => {
      if (await model.download(id)) {
        setSpeech({ step: 'idle' });
        await listen(id);
      }
    },
  };
}
