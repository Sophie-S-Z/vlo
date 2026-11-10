import { Headphones, Pause, Play, Plus, SkipBack, SkipForward, Trash2, X } from 'lucide-react';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { usePreferences } from '@/app/PreferencesProvider';
import { Button } from '@/ui/button';
import { cn } from '@/ui/cn';
import { Popover, PopoverContent, PopoverTrigger } from '@/ui/popover';
import { RadioGroup, RadioGroupItem } from '@/ui/radio-group';
import { Switch } from '@/ui/switch';
import { sceneInfo, type SceneChoice } from '../scenes/scenes';
import {
  changeSound,
  currentNature,
  dismissSoundMessage,
  pause,
  play,
  playTrack,
  preloadEngine,
  setSleep,
  setSoundContext,
  setTypewriter,
  skipTrack,
  useSoundState,
} from './controller';
import { addAudioFiles, removeAudioFile, useAudioFiles } from './library';
import { MOOD_LABELS, NATURE, SLEEP_CHOICES, useSoundSettings, type MoodId, type MusicSource } from './mix';
import { MOODS } from './music';

/* The sound button and its mixer (plan Task A9), in the header above the manuscript. */

const MUSIC_CHOICES: readonly { value: MusicSource; label: string }[] = [
  { value: 'off', label: 'No music' },
  ...(Object.keys(MOOD_LABELS) as MoodId[]).map((id) => ({ value: id, label: MOOD_LABELS[id] })),
  { value: 'own', label: 'Your music' },
];

const selectClass =
  'min-h-11 rounded-md border border-rule bg-surface px-2 text-sm text-text pointer-fine:min-h-8 focus-visible:outline-2 focus-visible:outline-accent';

function percent(value: number): string {
  return `${String(Math.round(value * 100))} percent`;
}

function minutes(seconds: number): string {
  if (!seconds) return '';
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${String(m)}:${String(s).padStart(2, '0')}`;
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  const id = useId();
  return (
    <section aria-labelledby={id} className="grid gap-2 border-t border-rule pt-3">
      <h3 id={id} className="text-xs font-medium text-muted">
        {title}
      </h3>
      {children}
    </section>
  );
}

function Volume({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <div className="grid grid-cols-[minmax(0,7.5rem)_1fr] items-center gap-3">
      <label htmlFor={id} className={cn('text-sm', disabled && 'text-muted')}>
        {label}
      </label>
      <input
        id={id}
        type="range"
        min={0}
        max={100}
        step={5}
        value={Math.round(value * 100)}
        disabled={disabled}
        aria-valuetext={percent(value)}
        onChange={(event) => {
          onChange(Number(event.target.value) / 100);
        }}
        className="min-h-8 min-w-0 accent-[var(--accent)] disabled:opacity-50"
      />
    </div>
  );
}

/** Minutes until the sleep timer ends, rounded up, updated each half minute. */
function useMinutesLeft(endsAt: number | null): number | null {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (endsAt === null) return;
    const id = setInterval(() => {
      setNow(Date.now());
    }, 30_000);
    return () => {
      clearInterval(id);
    };
  }, [endsAt]);
  return endsAt === null ? null : Math.max(0, Math.ceil((endsAt - now) / 60_000));
}

function OwnMusic() {
  const files = useAudioFiles();
  const settings = useSoundSettings();
  const sound = useSoundState();
  const input = useRef<HTMLInputElement>(null);
  const [problems, setProblems] = useState<string[]>([]);
  const [adding, setAdding] = useState(false);
  const repeatId = useId();
  const shuffleId = useId();

  return (
    <Section title="Your music">
      <p className="text-xs text-muted">
        Your files stay on this device and never leave it. Each file can be up to 50 MB.
      </p>
      <input
        ref={input}
        type="file"
        accept="audio/*,.mp3,.m4a,.aac,.ogg,.oga,.opus,.wav,.flac,.webm"
        multiple
        className="sr-only"
        tabIndex={-1}
        aria-label="Music files"
        onChange={(event) => {
          const chosen = Array.from(event.target.files ?? []);
          event.target.value = '';
          if (chosen.length === 0) return;
          setAdding(true);
          void addAudioFiles(chosen).then((found) => {
            setProblems(found);
            setAdding(false);
          });
        }}
      />
      <Button
        variant="outline"
        disabled={adding}
        onClick={() => {
          input.current?.click();
        }}
      >
        <Plus aria-hidden="true" className="size-4" />
        {adding ? 'Adding music' : 'Add music files'}
      </Button>
      {problems.length > 0 && (
        <div role="alert" className="grid gap-1 rounded-md border border-rule bg-surface p-2 text-sm">
          {problems.map((problem) => (
            <p key={problem}>{problem}</p>
          ))}
        </div>
      )}
      {files && files.length > 0 && (
        <>
          <ul aria-label="Your music files" className="grid max-h-40 gap-1 overflow-y-auto">
            {files.map((file) => {
              const current = sound.track?.id === file.id;
              return (
                <li
                  key={file.id}
                  className={cn(
                    'flex items-center gap-1 rounded-md pl-2 text-sm',
                    current && 'bg-surface font-medium',
                  )}
                >
                  <span className="min-w-0 flex-1 truncate" title={file.name}>
                    {file.name}
                  </span>
                  <span className="tabular-nums text-xs text-muted">{minutes(file.duration)}</span>
                  <Button
                    variant="ghost"
                    aria-label={`Play ${file.name}`}
                    aria-current={current ? 'true' : undefined}
                    className="px-2 pointer-fine:min-h-8"
                    onClick={() => {
                      void playTrack(file.id);
                    }}
                  >
                    <Play aria-hidden="true" className="size-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    aria-label={`Remove ${file.name}`}
                    className="px-2 pointer-fine:min-h-8"
                    onClick={() => {
                      if (current) skipTrack(1);
                      void removeAudioFile(file.id);
                    }}
                  >
                    <Trash2 aria-hidden="true" className="size-4" />
                  </Button>
                </li>
              );
            })}
          </ul>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <span className="flex items-center gap-2 text-sm">
              <Switch
                id={shuffleId}
                checked={settings.shuffle}
                onCheckedChange={(on) => {
                  changeSound({ shuffle: on });
                }}
              />
              <label htmlFor={shuffleId}>Shuffle</label>
            </span>
            <label htmlFor={repeatId} className="flex items-center gap-2 text-sm">
              Repeat
              <select
                id={repeatId}
                className={selectClass}
                value={settings.repeat}
                onChange={(event) => {
                  const value = event.target.value;
                  if (value === 'off' || value === 'all' || value === 'one') changeSound({ repeat: value });
                }}
              >
                <option value="off">Off</option>
                <option value="all">All files</option>
                <option value="one">This file</option>
              </select>
            </label>
            {settings.music === 'own' && sound.playing && (
              <span className="flex gap-1">
                <Button
                  variant="ghost"
                  aria-label="Previous file"
                  className="px-2 pointer-fine:min-h-8"
                  onClick={() => {
                    skipTrack(-1);
                  }}
                >
                  <SkipBack aria-hidden="true" className="size-4" />
                </Button>
                <Button
                  variant="ghost"
                  aria-label="Next file"
                  className="px-2 pointer-fine:min-h-8"
                  onClick={() => {
                    skipTrack(1);
                  }}
                >
                  <SkipForward aria-hidden="true" className="size-4" />
                </Button>
              </span>
            )}
          </div>
        </>
      )}
    </Section>
  );
}

/** What plays now, in one sentence for the status line. */
function summary(playing: boolean, music: MusicSource, track: string | null, layers: string[]): string {
  if (!playing) return 'Sound is off. Nothing plays until you press Play.';
  const parts: string[] = [];
  if (music === 'own') parts.push(track ? `“${track}”` : 'your music');
  else if (music !== 'off') parts.push(MOOD_LABELS[music]);
  parts.push(...layers);
  if (parts.length === 0) return 'Playing, with every sound turned down. Pick music or a nature sound.';
  const last = parts.pop() ?? '';
  return `Playing ${parts.length > 0 ? `${parts.join(', ')} and ${last}` : last}.`;
}

export function SoundControl({ scene }: { scene: SceneChoice }) {
  const settings = useSoundSettings();
  const sound = useSoundState();
  const { prefs } = usePreferences();
  const musicId = useId();
  const sleepId = useId();
  const titleId = useId();
  const followId = useId();
  const keysId = useId();
  const sceneId = scene === 'none' ? null : scene;
  const sceneSound = sceneId === null ? null : sceneInfo(sceneId).sound;
  const minutesLeft = useMinutesLeft(sound.sleepEndsAt);

  useEffect(() => {
    setSoundContext({ scene: sceneSound, calm: prefs.calm });
  }, [sceneSound, prefs.calm]);

  const nature = currentNature(settings);
  const playingLayers = NATURE.filter((n) => (nature[n.id] ?? 0) > 0).map((n) => n.label.toLowerCase());
  const moodHint = settings.music in MOODS ? MOODS[settings.music as MoodId].hint : null;
  const label = sound.playing ? 'Sound: playing' : 'Sound: off';

  return (
    <Popover
      onOpenChange={(open) => {
        if (open) void preloadEngine();
      }}
    >
      <PopoverTrigger asChild>
        <Button variant="ghost" aria-label={label} data-playing={sound.playing ? 'true' : 'false'}>
          <Headphones aria-hidden="true" className={cn('size-4', sound.playing && 'text-accent-text')} />
          <span className="max-sm:sr-only">Sound</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        aria-labelledby={titleId}
        className="grid max-h-[min(36rem,var(--radix-popover-content-available-height))] w-[min(24rem,calc(100vw-1.5rem))] gap-3 overflow-y-auto"
      >
        <div className="flex items-center justify-between gap-3">
          <h2 id={titleId} className="text-sm font-medium">
            Sound
          </h2>
          <Button
            variant={sound.playing ? 'outline' : 'primary'}
            onClick={() => {
              if (sound.playing) pause();
              else void play();
            }}
          >
            {sound.playing ? (
              <Pause aria-hidden="true" className="size-4" />
            ) : (
              <Play aria-hidden="true" className="size-4" />
            )}
            {sound.playing ? 'Pause' : 'Play'}
          </Button>
        </div>
        <p role="status" className="text-sm text-muted">
          {summary(sound.playing, settings.music, sound.track?.name ?? null, playingLayers)}
          {minutesLeft !== null && ` The sound fades out in ${String(minutesLeft)} min.`}
        </p>
        {sound.message && (
          <div
            role="alert"
            className="flex items-start gap-2 rounded-md border border-rule bg-surface p-2 text-sm"
          >
            <p className="flex-1">{sound.message}</p>
            <Button
              variant="ghost"
              aria-label="Dismiss"
              className="px-2 pointer-fine:min-h-8"
              onClick={dismissSoundMessage}
            >
              <X aria-hidden="true" className="size-4" />
            </Button>
          </div>
        )}

        <Section title="Music">
          <RadioGroup
            aria-label="Music"
            value={settings.music}
            onValueChange={(value) => {
              changeSound({ music: value as MusicSource });
            }}
            className="grid grid-cols-2 gap-x-3 gap-y-1"
          >
            {MUSIC_CHOICES.map((choice) => {
              const id = `${musicId}-${choice.value}`;
              return (
                <div key={choice.value} className="flex min-h-8 items-center gap-2">
                  <RadioGroupItem id={id} value={choice.value} />
                  <label htmlFor={id} className="text-sm">
                    {choice.label}
                  </label>
                </div>
              );
            })}
          </RadioGroup>
          {moodHint && <p className="text-xs text-muted">{moodHint} Vlo makes it as it plays.</p>}
          <Volume
            label="Music volume"
            value={settings.musicVolume}
            disabled={settings.music === 'off'}
            onChange={(value) => {
              changeSound({ musicVolume: value });
            }}
          />
        </Section>

        <Section title="Nature">
          <div className="flex items-start gap-3 text-sm">
            <Switch
              id={followId}
              aria-describedby={`${followId}-hint`}
              checked={settings.followScene}
              onCheckedChange={(on) => {
                changeSound({ followScene: on });
              }}
            />
            <span className="grid gap-0.5">
              <label htmlFor={followId}>Match the scene</label>
              <span id={`${followId}-hint`} className="text-xs text-muted">
                {sceneId === null
                  ? 'This project has no scene. Pick one with the Scene button.'
                  : prefs.calm
                    ? 'Calm mode is on, so the scene does not start its sounds. Move a slider to add sounds.'
                    : settings.followScene
                      ? `The ${sceneInfo(sceneId).label.toLowerCase()} sets these sounds.`
                      : `Turn on to let the ${sceneInfo(sceneId).label.toLowerCase()} set these sounds again.`}
              </span>
            </span>
          </div>
          {NATURE.map((layer) => (
            <Volume
              key={layer.id}
              label={layer.label}
              value={nature[layer.id] ?? 0}
              onChange={(value) => {
                // Moving a layer takes the mix from the scene and makes it the writer's own.
                changeSound({ followScene: false, nature: { ...nature, [layer.id]: value } });
              }}
            />
          ))}
        </Section>

        <OwnMusic />

        <Section title="Volume and sleep timer">
          <Volume
            label="All sound"
            value={settings.master}
            onChange={(value) => {
              changeSound({ master: value });
            }}
          />
          <div className="flex flex-wrap items-center gap-3">
            <label htmlFor={sleepId} className="text-sm">
              Sleep timer
            </label>
            <select
              id={sleepId}
              className={selectClass}
              value={sound.sleepMinutes}
              disabled={!sound.playing}
              onChange={(event) => {
                setSleep(Number(event.target.value));
              }}
            >
              {SLEEP_CHOICES.map((m) => (
                <option key={m} value={m}>
                  {m === 0 ? 'Off' : `${String(m)} minutes`}
                </option>
              ))}
            </select>
            {!sound.playing && <span className="text-xs text-muted">Press Play to set a timer.</span>}
          </div>
        </Section>

        <Section title="Typing">
          <div className="flex items-start gap-3 text-sm">
            <Switch
              id={keysId}
              aria-describedby={`${keysId}-hint`}
              checked={settings.typewriter && !prefs.calm}
              disabled={prefs.calm}
              onCheckedChange={(on) => {
                void setTypewriter(on);
              }}
            />
            <span className="grid gap-0.5">
              <label htmlFor={keysId}>Typewriter keys</label>
              <span id={`${keysId}-hint`} className="text-xs text-muted">
                {prefs.calm
                  ? 'Calm mode keeps key sounds off.'
                  : 'A soft click for each key, and a bell for Enter. They play without Play.'}
              </span>
            </span>
          </div>
          {settings.typewriter && !prefs.calm && (
            <Volume
              label="Key volume"
              value={settings.typewriterVolume}
              onChange={(value) => {
                changeSound({ typewriterVolume: value });
              }}
            />
          )}
        </Section>
      </PopoverContent>
    </Popover>
  );
}
