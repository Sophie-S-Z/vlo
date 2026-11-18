import { useId, useState } from 'react';
import { Button } from '@/ui/button';
import { Input } from '@/ui/input';
import { Switch } from '@/ui/switch';
import {
  cleanShortcut,
  MAX_SHORTCUT_FROM,
  MAX_SHORTCUTS,
  setWritingPrefs,
  useWritingPrefs,
  type TextShortcut,
} from '@/features/editor/writingPrefs';

/**
 * Settings > Writing > Text shortcuts (Phase 19, Task D3): the typo list, and the writer's own pairs of
 * "type this" and "get this", each with a switch. `onAnnounce` speaks each change.
 */
export function TextShortcutSettings({ onAnnounce }: { onAnnounce: (text: string) => void }) {
  const { shortcuts, typoFixes } = useWritingPrefs();
  const id = useId();
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [error, setError] = useState('');

  const save = (next: TextShortcut[]) => {
    setWritingPrefs({ shortcuts: next });
  };

  return (
    <div className="grid gap-4">
      <h3 className="text-sm font-medium">Text shortcuts</h3>
      <div className="flex items-start gap-3">
        <Switch
          id={`${id}-typos`}
          checked={typoFixes}
          aria-describedby={`${id}-typos-hint`}
          onCheckedChange={(on) => {
            setWritingPrefs({ typoFixes: on });
            onAnnounce(on ? 'Typo fixes on.' : 'Typo fixes off.');
          }}
        />
        <div className="grid gap-0.5">
          <label htmlFor={`${id}-typos`} className="cursor-pointer">
            Fix common typos
          </label>
          <p id={`${id}-typos-hint`} className="text-sm text-muted">
            In English prose, “teh” becomes “the” and “adn” becomes “and” after a space. Backspace right after
            a fix puts back what you typed.
          </p>
        </div>
      </div>

      {shortcuts.length > 0 && (
        <ul className="grid gap-2" aria-label="Your text shortcuts">
          {shortcuts.map((shortcut, i) => {
            const name = `Type ${shortcut.from} to get ${shortcut.to}`;
            return (
              <li key={shortcut.from} className="flex items-center gap-3 text-sm">
                <Switch
                  checked={shortcut.on}
                  aria-label={name}
                  onCheckedChange={(on) => {
                    save(shortcuts.map((s, j) => (j === i ? { ...s, on } : s)));
                    onAnnounce(on ? `${shortcut.from} on.` : `${shortcut.from} off.`);
                  }}
                />
                <span className="min-w-0 flex-1 truncate">
                  <span className="font-medium">{shortcut.from}</span> → {shortcut.to}
                </span>
                <Button
                  variant="ghost"
                  className="min-h-9 px-2 pointer-coarse:min-h-11"
                  aria-label={`Remove the shortcut ${shortcut.from}`}
                  onClick={() => {
                    save(shortcuts.filter((_, j) => j !== i));
                    onAnnounce(`Removed the shortcut ${shortcut.from}.`);
                  }}
                >
                  Remove
                </Button>
              </li>
            );
          })}
        </ul>
      )}

      <form
        className="grid gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          const shortcut = cleanShortcut({ from, to, on: true });
          if (!shortcut) {
            setError(
              `Type one word of up to ${String(MAX_SHORTCUT_FROM)} characters, and a different text to get.`,
            );
            return;
          }
          if (shortcuts.length >= MAX_SHORTCUTS && !shortcuts.some((s) => s.from === shortcut.from)) {
            setError(`You have ${String(MAX_SHORTCUTS)} shortcuts. Remove one first.`);
            return;
          }
          save([...shortcuts.filter((s) => s.from !== shortcut.from), shortcut]);
          onAnnounce(`Added the shortcut ${shortcut.from}.`);
          setFrom('');
          setTo('');
        }}
      >
        <div className="flex flex-wrap items-end gap-2">
          <div className="grid gap-1">
            <label htmlFor={`${id}-from`} className="text-sm">
              Type this
            </label>
            <Input
              id={`${id}-from`}
              value={from}
              className="w-32"
              aria-describedby={`${id}-help`}
              aria-invalid={error !== '' || undefined}
              onChange={(event) => {
                setFrom(event.target.value);
                setError('');
              }}
            />
          </div>
          <div className="grid min-w-48 flex-1 gap-1">
            <label htmlFor={`${id}-to`} className="text-sm">
              Get this
            </label>
            <Input
              id={`${id}-to`}
              value={to}
              aria-describedby={`${id}-help`}
              aria-invalid={error !== '' || undefined}
              onChange={(event) => {
                setTo(event.target.value);
                setError('');
              }}
            />
          </div>
          <Button type="submit" variant="outline">
            Add shortcut
          </Button>
        </div>
        <p id={`${id}-help`} className={error ? 'text-sm text-accent-text' : 'text-sm text-muted'}>
          {error ||
            'A shortcut runs after a space or a punctuation mark, in prose and in poems with smart punctuation.'}
        </p>
      </form>
    </div>
  );
}
