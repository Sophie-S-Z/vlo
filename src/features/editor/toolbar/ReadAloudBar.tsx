import type { Editor } from '@tiptap/core';
import { Pause, Play, Speech, Square } from 'lucide-react';
import { Button } from '@/ui/button';
import { pauseReading, resumeReading, stopReading, useReadState } from '../readAloud/reader';

/** A slim bar under the toolbar while Vlo reads aloud, so Pause and Stop are always in reach. */
export function ReadAloudBar({ editor }: { editor: Editor }) {
  const read = useReadState();
  if (read.editor !== editor || read.status === 'idle') return null;
  const where = `sentence ${String(read.index + 1)} of ${String(read.count)}`;
  return (
    <div
      role="region"
      aria-label="Read aloud"
      className="flex flex-wrap items-center gap-2 border-b border-rule bg-bg px-2 py-1.5 text-sm"
    >
      <Speech aria-hidden="true" className="size-4 text-accent-text" />
      <p className="min-w-0 flex-1 text-muted">
        {read.status === 'reading' ? `Reading ${where}` : `Paused at ${where}`}
      </p>
      {read.status === 'reading' ? (
        <Button variant="ghost" className="min-h-9 px-2 pointer-coarse:min-h-11" onClick={pauseReading}>
          <Pause aria-hidden="true" className="size-4" />
          Pause
        </Button>
      ) : (
        <Button variant="ghost" className="min-h-9 px-2 pointer-coarse:min-h-11" onClick={resumeReading}>
          <Play aria-hidden="true" className="size-4" />
          Resume
        </Button>
      )}
      <Button variant="ghost" className="min-h-9 px-2 pointer-coarse:min-h-11" onClick={stopReading}>
        <Square aria-hidden="true" className="size-4" />
        Stop reading
      </Button>
    </div>
  );
}
