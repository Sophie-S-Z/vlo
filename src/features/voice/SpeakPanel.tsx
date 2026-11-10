import type { Editor } from '@tiptap/core';
import { Mic, Square } from 'lucide-react';
import { useEffect } from 'react';
import { Button } from '@/ui/button';
import { clock, LevelMeter, SpeechStatus } from './SpeechParts';
import { useRecorder, useSpeech } from './useSpeech';

/*
 * "Speak to write" (roadmap 2 F62, plan Task M1). The writer speaks, and the words go in at the cursor.
 * The speech model runs on this device, and the audio is not kept.
 */

/** A clip stops here, so the model turns it into text in one pass. */
export const MAX_SECONDS = 30;

export function SpeakPanel({
  editor,
  language,
  onDone,
}: {
  editor: Editor;
  language: string | undefined;
  /** Closes the panel after the words go in. */
  onDone: () => void;
}) {
  const recorder = useRecorder();
  const speech = useSpeech(editor, language, onDone);
  const { recording, seconds } = recorder;

  const stop = async () => {
    const audio = await recorder.stop();
    if (audio) await speech.toText(audio);
  };

  useEffect(() => {
    if (recording && seconds >= MAX_SECONDS) void stop();
    // `stop` is new on each render, and the time is the only reason to stop here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recording, seconds]);

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center gap-3">
        {recording ? (
          <Button onClick={() => void stop()}>
            <Square aria-hidden="true" className="size-4" />
            Stop and write
          </Button>
        ) : (
          <Button disabled={speech.busy} onClick={() => void recorder.record()}>
            <Mic aria-hidden="true" className="size-4" />
            Speak
          </Button>
        )}
        {/* Only "Listening" is live, so a screen reader does not read the time each second. */}
        <p className="text-sm text-muted tabular-nums">
          <span role="status">{recording ? 'Listening' : ''}</span>
          {recording ? `, ${clock(seconds)} of ${clock(MAX_SECONDS)}` : ''}
        </p>
      </div>
      <LevelMeter level={recorder.level} />
      <p className="text-sm text-muted">
        Vlo turns your speech into text on this device. The audio never leaves it, and Vlo does not keep it.
      </p>
      {recorder.problem && (
        <p role="alert" className="text-sm text-accent-text">
          {recorder.problem}
        </p>
      )}
      <SpeechStatus speech={speech} />
    </div>
  );
}
