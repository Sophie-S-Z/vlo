import type { Editor } from '@tiptap/core';
import { Mic, Square } from 'lucide-react';
import { Button } from '@/ui/button';
import { clock, LevelMeter, SpeechStatus } from './SpeechParts';
import { useDictation } from './useSpeech';

/*
 * "Speak to write" (roadmap 2 F62, plan Task M1). The writer speaks for as long as they like, and the words
 * of each pause go in at the cursor. The speech model runs on this device, and the audio is not kept.
 */

export function SpeakPanel({
  editor,
  language,
  onDone,
}: {
  editor: Editor;
  language: string | undefined;
  /** Closes the panel after the last words go in. */
  onDone: () => void;
}) {
  const dictation = useDictation(editor, language, onDone);
  const { listening, stopping, seconds } = dictation;

  let status = '';
  if (listening) status = 'Listening';
  else if (stopping) status = 'Writing the last words';

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center gap-3">
        {listening ? (
          <Button onClick={() => void dictation.stop()}>
            <Square aria-hidden="true" className="size-4" />
            Stop
          </Button>
        ) : (
          <Button disabled={dictation.busy} onClick={() => void dictation.start()}>
            <Mic aria-hidden="true" className="size-4" />
            Speak
          </Button>
        )}
        {/* Only the status is live, so a screen reader does not read the time each second. */}
        <p className="text-sm text-muted tabular-nums">
          <span role="status">{status}</span>
          {listening ? `, ${clock(seconds)}` : ''}
        </p>
      </div>
      <LevelMeter level={dictation.level} />
      <p className="text-sm text-muted">
        Speak for as long as you like. Your words go in at the cursor each time that you pause. Vlo turns your
        speech into text on this device. The audio never leaves it, and Vlo does not keep it.
      </p>
      {dictation.problem && (
        <p role="alert" className="text-sm text-accent-text">
          {dictation.problem}
        </p>
      )}
      <SpeechStatus speech={dictation} />
    </div>
  );
}
