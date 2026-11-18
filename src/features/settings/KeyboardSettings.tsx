import { Fragment, useState } from 'react';
import { Button } from '@/ui/button';
import {
  BROWSER_KEYS,
  eventKeys,
  isApplePlatform,
  KEPT_KEYS,
  sameKeys,
  shortcutLabel,
} from '@/features/editor/commands/keys';
import {
  COMMANDS,
  GROUP_LABELS,
  keysOf,
  type CommandGroup,
  type EditorCommand,
} from '@/features/editor/commands/registry';
import { CustomizeToolbar } from '@/features/editor/toolbar/CustomizeToolbar';
import { pinnableTools } from '@/features/editor/toolbar/toolbarLayout';
import { setWriterTools, useWriterTools } from '@/features/editor/writerTools';

/*
 * Settings > Toolbar and Settings > Keyboard (Phase 19, Task E1). Each tool shows its key. "Change" waits
 * for the next key press. A key of another tool, or a key that the browser uses, gets a warning and a
 * choice. Settings loads this module only when it opens.
 */

/** Every tool that a writer can pin in any form, in menu order. */
const ALL_PINNABLE = [
  ...new Set([...pinnableTools('prose'), ...pinnableTools('poem'), ...pinnableTools('script')]),
];

export function ToolbarSettings() {
  const [open, setOpen] = useState(false);
  const own = useWriterTools();
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="max-w-prose text-sm text-muted">
        {own.toolbar === null
          ? 'The toolbar has Vlo’s own tools. Pin the tools that you use most, in your order.'
          : `You pinned ${String(own.toolbar.length)} ${own.toolbar.length === 1 ? 'tool' : 'tools'}. Each form shows the ones that it has.`}
      </p>
      <Button
        variant="outline"
        onClick={() => {
          setOpen(true);
        }}
      >
        Customize toolbar…
      </Button>
      {open && <CustomizeToolbar open onOpenChange={setOpen} tools={ALL_PINNABLE} />}
    </div>
  );
}

/** One row of each tool id, in registry order: a tool that each form has once is listed once. */
const TOOLS: readonly EditorCommand[] = [...new Map(COMMANDS.map((c) => [c.id, c])).values()];

/** A key change that waits for the writer's choice. */
interface Ask {
  cmd: EditorCommand;
  keys: string;
  /** Tools that have the key now. The change takes it from them. */
  from: EditorCommand[];
  browser: boolean;
}

function keyText(keys: string | undefined): string {
  return keys ? shortcutLabel(keys) : 'No key';
}

export function KeyboardSettings({ onAnnounce }: { onAnnounce: (text: string) => void }) {
  const own = useWriterTools().keys;
  const [recording, setRecording] = useState<EditorCommand | null>(null);
  const [problem, setProblem] = useState('');
  const [ask, setAsk] = useState<Ask | null>(null);
  const apple = isApplePlatform();

  /** Saves the key, and takes it from each tool in `from`. Vlo's own key needs no entry. */
  const save = (cmd: EditorCommand, keys: string, from: readonly EditorCommand[] = []) => {
    const next = Object.fromEntries(Object.entries(own).filter(([id]) => id !== cmd.id));
    for (const other of from) next[other.id] = '';
    if ((cmd.keys ?? '') !== keys) next[cmd.id] = keys;
    setWriterTools({ keys: next });
    setRecording(null);
    setAsk(null);
    setProblem('');
    const taken = from.length > 0 ? ` ${from.map((c) => c.label).join(' and ')} has no key now.` : '';
    onAnnounce(keys ? `${cmd.label}: ${shortcutLabel(keys, apple)}.${taken}` : `${cmd.label} has no key.`);
  };

  /** Checks a key for `cmd`, then saves it or asks first. */
  const choose = (cmd: EditorCommand, keys: string) => {
    if (keys === '') {
      save(cmd, '');
      return;
    }
    const kept = Object.entries(KEPT_KEYS).find(([key]) => sameKeys(key, keys));
    if (kept) {
      setProblem(`Vlo keeps ${shortcutLabel(keys, apple)} for ${kept[1]}. Press another key.`);
      return;
    }
    const from = TOOLS.filter((other) => {
      const theirs = keysOf(other, own);
      return other.id !== cmd.id && theirs !== undefined && sameKeys(theirs, keys);
    });
    const browser = BROWSER_KEYS.some((key) => sameKeys(key, keys));
    if (from.length === 0 && !browser) save(cmd, keys);
    else setAsk({ cmd, keys, from, browser });
  };

  const changed = Object.keys(own).length > 0;
  const groups = new Map<CommandGroup, EditorCommand[]>();
  for (const cmd of TOOLS) groups.set(cmd.group, [...(groups.get(cmd.group) ?? []), cmd]);

  return (
    <div className="grid gap-5">
      <p className="max-w-prose text-sm text-muted">
        Choose Change, then press the new key. A key needs {apple ? '⌘, Control' : 'Ctrl'} or{' '}
        {apple ? '⌥' : 'Alt'}, or it is an F key. Escape stops without a change.
      </p>
      {[...groups].map(([group, tools]) => (
        <section key={group} aria-labelledby={`keys-${group}`} className="grid gap-1">
          <h3 id={`keys-${group}`} className="text-sm font-medium">
            {GROUP_LABELS[group]}
          </h3>
          <dl className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 text-sm">
            {tools.map((cmd) => {
              const keys = keysOf(cmd, own);
              const mine = own[cmd.id] !== undefined;
              return (
                <Fragment key={cmd.id}>
                  <dt className="py-1">{cmd.label}</dt>
                  <dd className="flex flex-wrap items-center justify-end gap-2">
                    {recording?.id === cmd.id ? (
                      <Recorder
                        cmd={cmd}
                        apple={apple}
                        onKeys={(next) => {
                          choose(cmd, next);
                        }}
                        onProblem={setProblem}
                        onStop={() => {
                          setRecording(null);
                          setProblem('');
                        }}
                      />
                    ) : (
                      <>
                        <kbd
                          className={`rounded border border-rule bg-bg px-1.5 py-0.5 font-mono text-xs ${keys ? '' : 'text-muted'}`}
                        >
                          {keyText(keys)}
                        </kbd>
                        <Button
                          variant="ghost"

                          aria-label={`Change the key for ${cmd.label}`}
                          onClick={() => {
                            setAsk(null);
                            setProblem('');
                            setRecording(cmd);
                          }}
                        >
                          Change
                        </Button>
                        {mine && (
                          <Button
                            variant="ghost"

                            aria-label={`Use Vlo’s key for ${cmd.label}`}
                            onClick={() => {
                              choose(cmd, cmd.keys ?? '');
                            }}
                          >
                            Reset
                          </Button>
                        )}
                      </>
                    )}
                  </dd>
                  {(recording?.id === cmd.id || ask?.cmd.id === cmd.id) && (problem || ask) && (
                    <dd className="col-span-2 grid gap-2 rounded-md border border-rule bg-bg p-3">
                      {problem && <p role="alert">{problem}</p>}
                      {ask && (
                        <>
                          <p role="alert">
                            {ask.from.length > 0 &&
                              `${ask.from.map((c) => c.label).join(' and ')} ${ask.from.length === 1 ? 'has' : 'have'} ${shortcutLabel(ask.keys, apple)} now. `}
                            {ask.browser &&
                              `Your browser uses ${shortcutLabel(ask.keys, apple)}, and it can act before Vlo sees the key. `}
                            Give the key to {ask.cmd.label}?
                          </p>
                          <div className="flex flex-wrap gap-2">
                            <Button
                              onClick={() => {
                                save(ask.cmd, ask.keys, ask.from);
                              }}
                            >
                              Give it to {ask.cmd.label}
                            </Button>
                            <Button
                              variant="outline"
                              onClick={() => {
                                setAsk(null);
                                setRecording(null);
                              }}
                            >
                              Keep the old key
                            </Button>
                          </div>
                        </>
                      )}
                    </dd>
                  )}
                </Fragment>
              );
            })}
          </dl>
        </section>
      ))}
      <div>
        <Button
          variant="outline"
          disabled={!changed}
          onClick={() => {
            setWriterTools({ keys: {} });
            onAnnounce('Each tool has Vlo’s own key again.');
          }}
        >
          Reset all keys
        </Button>
      </div>
    </div>
  );
}

/** Waits for one key press. Tab still moves on, and Escape stops. */
function Recorder({
  cmd,
  apple,
  onKeys,
  onProblem,
  onStop,
}: {
  cmd: EditorCommand;
  apple: boolean;
  onKeys: (keys: string) => void;
  onProblem: (text: string) => void;
  onStop: () => void;
}) {
  return (
    <>
      <button
        type="button"
        // The recorder takes the focus at once, as a field that the writer opened.
        // eslint-disable-next-line jsx-a11y/no-autofocus
        autoFocus
        aria-label={`Press the new key for ${cmd.label}`}
        className="rounded-md border border-accent bg-surface px-2 py-1 font-mono text-xs text-accent-text outline-none focus-visible:ring-2 focus-visible:ring-accent"
        onKeyDown={(event) => {
          if (event.key === 'Tab') return;
          event.preventDefault();
          if (event.key === 'Escape') {
            onStop();
            return;
          }
          const keys = eventKeys(event.nativeEvent, apple);
          if (keys) onKeys(keys);
          else if (!['Control', 'Meta', 'Alt', 'Shift'].includes(event.key))
            onProblem(
              `Hold ${apple ? '⌘, Control' : 'Ctrl'} or ${apple ? '⌥' : 'Alt'} with the key, or press an F key.`,
            );
        }}
      >
        Press a key…
      </button>
      <Button
        variant="ghost"

        onClick={() => {
          onKeys('');
        }}
      >
        No key
      </Button>
      <Button variant="ghost" onClick={onStop}>
        Cancel
      </Button>
    </>
  );
}
