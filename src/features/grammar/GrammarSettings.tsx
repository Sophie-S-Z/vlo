import { useId, useState } from 'react';
import { Button } from '@/ui/button';
import { Input } from '@/ui/input';
import { Switch } from '@/ui/switch';
import { addWord, MAX_WORD, removeWord, setGrammarOn, setRuleOn, useGrammarPrefs } from './grammarPrefs';
import { ruleLabel } from './lints';

/**
 * Settings for spelling and grammar (Phase 19, Task D1): the switch, the personal dictionary and the rules
 * that the writer turned off from a mark. `onAnnounce` speaks each change.
 */
export function GrammarSettings({ onAnnounce }: { onAnnounce: (text: string) => void }) {
  const prefs = useGrammarPrefs();
  const id = useId();
  const [word, setWord] = useState('');
  const [error, setError] = useState('');

  return (
    <div className="grid gap-5">
      <div className="flex items-start gap-3">
        <Switch
          id={id}
          checked={prefs.on}
          aria-describedby={`${id}-hint`}
          onCheckedChange={(on) => {
            setGrammarOn(on);
            onAnnounce(on ? 'Spelling and grammar check on.' : 'Spelling and grammar check off.');
          }}
        />
        <div className="grid gap-0.5">
          <label htmlFor={id} className="cursor-pointer">
            Check spelling and grammar
          </label>
          <p id={`${id}-hint`} className="text-sm text-muted">
            Marks typos and grammar in English prose after a pause. The check runs on this device, and the
            first one downloads it (about 8 MB). When it is off, your browser checks spelling.
          </p>
        </div>
      </div>

      <form
        className="grid gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          if (!addWord(word)) {
            setError(`Type one word of up to ${String(MAX_WORD)} characters.`);
            return;
          }
          onAnnounce(`Added ${word.trim()} to your dictionary.`);
          setWord('');
        }}
      >
        <label htmlFor={`${id}-word`} className="text-sm font-medium">
          Your dictionary
        </label>
        <p id={`${id}-word-hint`} className={error ? 'text-sm text-accent-text' : 'text-sm text-muted'}>
          {error ||
            'The check knows these words, and the names in each Codex. "Add to dictionary" on a mark adds a word too.'}
        </p>
        <div className="flex gap-2">
          <Input
            id={`${id}-word`}
            value={word}
            aria-invalid={error !== '' || undefined}
            aria-describedby={`${id}-word-hint`}
            className="max-w-64"
            onChange={(event) => {
              setWord(event.target.value);
              setError('');
            }}
          />
          <Button type="submit" variant="outline">
            Add
          </Button>
        </div>
        {prefs.words.length > 0 && (
          <ul className="flex flex-wrap gap-2" aria-label="Words in your dictionary">
            {prefs.words.map((w) => (
              <li key={w} className="flex items-center gap-1 rounded-md border border-rule ps-2 text-sm">
                {w}
                <Button
                  type="button"
                  variant="ghost"
                  className="min-h-9 px-2 pointer-coarse:min-h-11"
                  aria-label={`Remove ${w} from your dictionary`}
                  onClick={() => {
                    removeWord(w);
                    onAnnounce(`Removed ${w} from your dictionary.`);
                  }}
                >
                  Remove
                </Button>
              </li>
            ))}
          </ul>
        )}
      </form>

      {prefs.offRules.length > 0 && (
        <div className="grid gap-2">
          <p className="text-sm font-medium">Rules you turned off</p>
          <ul className="grid gap-1" aria-label="Rules you turned off">
            {prefs.offRules.map((rule) => (
              <li key={rule} className="flex items-center justify-between gap-2 text-sm">
                {ruleLabel(rule)}
                <Button
                  variant="ghost"
                  className="min-h-9 px-2 pointer-coarse:min-h-11"
                  aria-label={`Turn on the rule “${ruleLabel(rule)}”`}
                  onClick={() => {
                    setRuleOn(rule, true);
                    onAnnounce(`The rule ${ruleLabel(rule)} is on.`);
                  }}
                >
                  Turn on
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
