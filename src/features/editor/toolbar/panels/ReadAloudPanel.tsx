import type { Editor } from '@tiptap/core';
import { Pause, Play, Square } from 'lucide-react';
import { useId, useMemo, useState } from 'react';
import { codexMatcher } from '@/features/codex/codex';
import { useCodexState } from '@/features/codex/codexStore';
import { Button } from '@/ui/button';
import { getCast, setCast, voiceFor, type CastSettings } from '../../readAloud/cast';
import {
  dismissReadMessage,
  getReadSettings,
  MAX_RATE,
  MIN_RATE,
  pauseReading,
  resumeReading,
  setReadSettings,
  startReading,
  stopReading,
  useReadState,
  type ReadSettings,
} from '../../readAloud/reader';
import { speechAvailable, useLocalVoices, type VoiceChoice } from '../../readAloud/voices';

const SELECT = 'min-h-11 rounded-md border border-rule bg-bg px-2 text-sm text-text pointer-fine:min-h-9';

function VoiceSelect({
  id,
  voices,
  value,
  onChange,
}: {
  id: string;
  voices: readonly VoiceChoice[];
  value: string;
  onChange: (uri: string) => void;
}) {
  return (
    <select
      id={id}
      value={value}
      onChange={(event) => {
        onChange(event.target.value);
      }}
      className={SELECT}
    >
      {voices.map((v) => (
        <option key={v.uri} value={v.uri}>
          {v.name} ({v.lang})
        </option>
      ))}
    </select>
  );
}

/*
 * The read aloud panel (plan E2): a voice, a speed, and Read, Pause and Stop. The reading goes on when
 * the panel closes, and the toolbar button shows that it is on. With Codex characters, a table read
 * (F58) gives the narrator and each character a voice.
 */

export function ReadAloudPanel({ editor }: { editor: Editor }) {
  const voiceId = useId();
  const rateId = useId();
  const [settings, setSettings] = useState<ReadSettings>(getReadSettings);
  const { ready, voices } = useLocalVoices();
  const read = useReadState();
  const codex = useCodexState();
  const projectId = codex.projectId;
  const [cast, setCastState] = useState<CastSettings>(() =>
    projectId ? getCast(projectId) : { on: false, voices: {} },
  );
  const characters = useMemo(() => codex.entries.filter((e) => e.kind === 'character'), [codex.entries]);
  const match = useMemo(() => codexMatcher(characters), [characters]);
  const mine = read.editor === editor;
  const status = mine ? read.status : 'idle';

  const change = (next: Partial<ReadSettings>) => {
    setSettings(setReadSettings(next));
  };
  const changeCast = (next: Partial<CastSettings>) => {
    if (projectId) setCastState(setCast(projectId, next));
  };

  if (!speechAvailable()) {
    return (
      <div className="grid gap-2 text-sm">
        <h2 className="font-medium">Read aloud</h2>
        <p className="text-muted">This browser cannot read aloud.</p>
      </div>
    );
  }

  const selected = !editor.state.selection.empty;
  const chosen = voices.find((v) => v.uri === settings.voice) ?? voices[0];
  const tableRead = projectId !== null && characters.length > 0;
  const speakers = characters.map((c) => c.id);
  const voiceOf = voiceFor(
    speakers,
    voices.map((v) => v.uri),
    cast.voices,
    chosen?.uri ?? null,
  );
  // Only the characters that the text names get a voice choice.
  const { doc } = editor.state;
  const named = new Set(match(doc.textBetween(0, doc.content.size, '\n')).map((m) => m.entryId));
  const startRead = () => {
    startReading(editor, tableRead && cast.on ? { match, voiceOf } : undefined);
  };
  let summary = '';
  if (status === 'reading') summary = `Reading sentence ${String(read.index + 1)} of ${String(read.count)}.`;
  else if (status === 'paused')
    summary = `Paused at sentence ${String(read.index + 1)} of ${String(read.count)}.`;

  return (
    <div className="grid gap-3 text-sm">
      <div className="grid gap-1">
        <h2 className="font-medium">Read aloud</h2>
        <p className="text-xs text-muted">
          Hear your words to catch slips. Vlo uses voices on this device only, so your text stays here.
        </p>
      </div>

      {read.message && (
        <div role="alert" className="grid gap-2 rounded-md border border-rule bg-bg p-2">
          <p>{read.message}</p>
          <Button variant="ghost" className="min-h-9 justify-self-start px-2" onClick={dismissReadMessage}>
            Dismiss
          </Button>
        </div>
      )}

      {!ready && <p className="text-muted">Looking for voices on this device.</p>}
      {ready && voices.length === 0 && (
        <p className="text-muted">
          This device has no on-device voices, so Vlo cannot read aloud here. Add a voice in your
          system&apos;s speech settings, then open this panel again.
        </p>
      )}

      {voices.length > 0 && (
        <>
          <div className="grid gap-1">
            <label htmlFor={voiceId} className="text-xs text-muted">
              {tableRead && cast.on ? 'Voice of the narrator' : 'Voice'}
            </label>
            <VoiceSelect
              id={voiceId}
              voices={voices}
              value={chosen?.uri ?? ''}
              onChange={(voice) => {
                change({ voice });
              }}
            />
          </div>
          <div className="grid gap-1">
            <div className="flex items-baseline justify-between">
              <label htmlFor={rateId} className="text-xs text-muted">
                Speed
              </label>
              <span aria-hidden="true" className="tabular-nums text-xs text-muted">
                {settings.rate.toFixed(1)}×
              </span>
            </div>
            <input
              id={rateId}
              type="range"
              min={MIN_RATE}
              max={MAX_RATE}
              step={0.1}
              value={settings.rate}
              aria-valuetext={`${settings.rate.toFixed(1)} times`}
              onChange={(event) => {
                change({ rate: Number(event.target.value) });
              }}
              className="min-h-8 w-full accent-[var(--accent)]"
            />
            <p className="text-xs text-muted">A new speed starts with the next sentence.</p>
          </div>

          {tableRead && (
            <fieldset className="grid gap-2">
              <legend className="sr-only">Table read</legend>
              <label className="flex min-h-11 items-center gap-2 pointer-fine:min-h-9">
                <input
                  type="checkbox"
                  checked={cast.on}
                  onChange={(event) => {
                    changeCast({ on: event.target.checked });
                  }}
                  className="size-4 accent-[var(--accent)]"
                />
                Table read: a voice for each character
              </label>
              {cast.on &&
                (named.size === 0 ? (
                  <p className="text-xs text-muted">The text names no Codex character yet.</p>
                ) : (
                  characters
                    .filter((c) => named.has(c.id))
                    .map((c) => (
                      <div key={c.id} className="grid gap-1">
                        <label htmlFor={`${voiceId}-${c.id}`} className="text-xs text-muted">
                          Voice of {c.name}
                        </label>
                        <VoiceSelect
                          id={`${voiceId}-${c.id}`}
                          voices={voices}
                          value={voiceOf(c.id) ?? ''}
                          onChange={(uri) => {
                            changeCast({ voices: { ...cast.voices, [c.id]: uri } });
                          }}
                        />
                      </div>
                    ))
                ))}
              {cast.on && (
                <p className="text-xs text-muted">
                  Vlo finds the speaker of each quote from the names near it. A quote with no clear speaker
                  gets the narrator&apos;s voice.
                </p>
              )}
            </fieldset>
          )}

          <div className="flex flex-wrap gap-2">
            {status === 'idle' && (
              <Button className="min-h-11 pointer-fine:min-h-9" onClick={startRead}>
                <Play aria-hidden="true" className="size-4" />
                {selected ? 'Read the selection' : 'Read from the cursor'}
              </Button>
            )}
            {status === 'reading' && (
              <Button variant="outline" className="min-h-11 pointer-fine:min-h-9" onClick={pauseReading}>
                <Pause aria-hidden="true" className="size-4" />
                Pause
              </Button>
            )}
            {status === 'paused' && (
              <Button className="min-h-11 pointer-fine:min-h-9" onClick={resumeReading}>
                <Play aria-hidden="true" className="size-4" />
                Resume
              </Button>
            )}
            {status !== 'idle' && (
              <Button variant="outline" className="min-h-11 pointer-fine:min-h-9" onClick={stopReading}>
                <Square aria-hidden="true" className="size-4" />
                Stop
              </Button>
            )}
          </div>
        </>
      )}
      <p role="status" className="text-xs text-muted empty:hidden">
        {summary}
      </p>
    </div>
  );
}
