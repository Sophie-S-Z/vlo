import { useEffect, useId, useState } from 'react';
import { Button } from '@/ui/button';
import { Switch } from '@/ui/switch';
import type { Rhyme, Rhymes, ThesaurusEntry } from './thesaurus';
import { rhymesOf, wordsFor } from './thesaurusClient';

/*
 * The thesaurus card's lists (Phase 19, Task D2): the senses of a word with their synonyms and antonyms,
 * and its rhymes. The card at the word and the Workshop's Rhymes tool share them.
 */

type Found<T> =
  { status: 'loading' } | { status: 'failed'; retry: () => void } | { status: 'ready'; value: T };

/** Looks the word up in the worker. A newer word wins over an older answer. */
function useLookUp<T>(word: string, find: (word: string) => Promise<T>): Found<T> {
  const [attempt, setAttempt] = useState(0);
  const [found, setFound] = useState<{ key: string; result: Found<T> } | null>(null);
  const key = `${String(attempt)} ${word}`;
  useEffect(() => {
    let alive = true;
    find(word).then(
      (value) => {
        if (alive) setFound({ key, result: { status: 'ready', value } });
      },
      () => {
        if (alive)
          setFound({
            key,
            result: {
              status: 'failed',
              retry: () => {
                setAttempt((n) => n + 1);
              },
            },
          });
      },
    );
    return () => {
      alive = false;
    };
  }, [key, word, find]);
  return found?.key === key ? found.result : { status: 'loading' };
}

const CHIP =
  'min-h-9 rounded-md border border-rule bg-bg px-2.5 text-sm text-text hover:border-muted hover:bg-surface pointer-coarse:min-h-11';

function Waiting({ found, what }: { found: Found<unknown>; what: string }) {
  if (found.status === 'failed')
    return (
      <div className="grid justify-items-start gap-2">
        <p role="status" className="text-sm text-accent-text">
          Vlo could not load the {what}.
        </p>
        <Button variant="outline" onClick={found.retry}>
          Try again
        </Button>
      </div>
    );
  return (
    <p role="status" className="text-sm text-muted">
      Loading the {what} on this device.
    </p>
  );
}

/** The senses of the word. A click on a word calls `onChoose` with it. */
export function SynonymList({ word, onChoose }: { word: string; onChoose: (word: string) => void }) {
  const found = useLookUp<ThesaurusEntry | null>(word, wordsFor);
  if (found.status !== 'ready') return <Waiting found={found} what="thesaurus" />;
  const entry = found.value;
  if (!entry || entry.senses.length === 0)
    return <p className="text-sm text-muted">The thesaurus has no words for “{word.trim()}”.</p>;
  const choices = (label: string, words: readonly string[]) => (
    <ul aria-label={label} className="flex flex-wrap gap-1.5">
      {words.map((w) => (
        <li key={w}>
          <button
            type="button"
            className={CHIP}
            onClick={() => {
              onChoose(w);
            }}
          >
            {w}
          </button>
        </li>
      ))}
    </ul>
  );
  return (
    <div className="grid gap-4">
      {entry.word !== word.trim().toLowerCase() && (
        <p className="text-sm text-muted">Words for “{entry.word}”.</p>
      )}
      {entry.senses.map((sense, i) => (
        <section key={i} className="grid gap-1.5">
          <h3 className="text-sm">
            <span className="text-muted italic">{sense.pos}</span> {sense.definition}
          </h3>
          {sense.words.length > 0 && choices(`Words that mean: ${sense.definition}`, sense.words)}
          {sense.antonyms.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs text-muted">Opposite</span>
              {choices(`Opposites of: ${sense.definition}`, sense.antonyms)}
            </div>
          )}
        </section>
      ))}
      <p className="text-xs text-muted">From Open English WordNet, CC BY 4.0.</p>
    </div>
  );
}

function RhymeGroup({ label, rhymes }: { label: string; rhymes: readonly Rhyme[] }) {
  if (rhymes.length === 0) return null;
  return (
    <section className="grid gap-1.5">
      <h3 className="text-sm font-medium">{label}</h3>
      <p className="font-manuscript text-base leading-7 [overflow-wrap:anywhere]">
        {rhymes.map((r) => r.word).join(', ')}
      </p>
    </section>
  );
}

/** The perfect and near rhymes of the word, with a switch for the word's own syllable count. */
export function RhymeList({ word }: { word: string }) {
  const id = useId();
  const [same, setSame] = useState(false);
  const found = useLookUp<Rhymes | null>(word, rhymesOf);
  if (found.status !== 'ready') return <Waiting found={found} what="rhymes" />;
  const rhymes = found.value;
  if (!rhymes) return <p className="text-sm text-muted">Vlo has no pronunciation for “{word.trim()}”.</p>;
  const keep = (list: readonly Rhyme[]) =>
    same ? list.filter((r) => r.syllables === rhymes.syllables) : list;
  const perfect = keep(rhymes.perfect);
  const near = keep(rhymes.near);
  const syllables = rhymes.syllables === 1 ? '1 syllable' : `${String(rhymes.syllables)} syllables`;
  return (
    <div className="grid gap-4">
      <div className="flex items-center gap-3">
        <Switch id={`${id}-same`} checked={same} onCheckedChange={setSame} />
        <label htmlFor={`${id}-same`} className="text-sm">
          Only words of {syllables}
        </label>
      </div>
      <RhymeGroup label="Rhymes" rhymes={perfect} />
      <RhymeGroup label="Near rhymes" rhymes={near} />
      {perfect.length === 0 && near.length === 0 && (
        <p className="text-sm text-muted">Vlo found no rhymes for “{rhymes.word}”.</p>
      )}
    </div>
  );
}
