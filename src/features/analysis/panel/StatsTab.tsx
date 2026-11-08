import { useEffect, useId, useState, type ReactNode } from 'react';
import { Button } from '@/ui/button';
import { Switch } from '@/ui/switch';
import { setAnalysisPrefs, useAnalysisPrefs } from '../analysisPrefs';
import { statsInWorker } from '../analysisClient';
import { durationLabel, LONG_SENTENCE, type FullStats, type Keyword } from '../stats';

/*
 * Every count and score of the open item: the numbers that word-count sites show, with a short note on
 * what each readability score means.
 */

const numbers = new Intl.NumberFormat();
const percent = (value: number) => `${String(Math.round(value * 1000) / 10)}%`;

function Row({ term, value, note }: { term: string; value: string; note?: string }) {
  return (
    <div className="grid grid-cols-[1fr_auto] items-baseline gap-x-3 gap-y-0.5">
      <dt className="text-muted">{term}</dt>
      <dd className="text-right font-mono">{value}</dd>
      {note && <dd className="col-span-2 text-xs text-muted">{note}</dd>}
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  const id = useId();
  return (
    <section aria-labelledby={id} className="grid gap-2">
      <h3 id={id} className="font-medium">
        {title}
      </h3>
      {children}
    </section>
  );
}

export function KeywordTable({ caption, rows }: { caption: string; rows: readonly Keyword[] }) {
  if (rows.length === 0)
    return <p className="text-sm text-muted">{caption}: no word or phrase repeats yet.</p>;
  return (
    <table className="w-full text-sm">
      <caption className="mb-1 text-left font-medium">{caption}</caption>
      <thead>
        <tr className="text-left text-muted">
          <th scope="col" className="font-normal">
            Word or phrase
          </th>
          <th scope="col" className="text-right font-normal">
            Times
          </th>
          <th scope="col" className="text-right font-normal">
            Density
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.phrase} className="border-t border-rule">
            <td className="py-1 [overflow-wrap:anywhere]">{row.phrase}</td>
            <td className="py-1 text-right font-mono">{numbers.format(row.count)}</td>
            <td className="py-1 text-right font-mono">{String(row.density)}%</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function useItemStats(text: string, kind: 'prose' | 'poem') {
  const [stats, setStats] = useState<FullStats | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    let current = true;
    statsInWorker(text, kind).then(
      (next) => {
        if (current) setStats(next);
      },
      () => {
        if (current) setError(true);
      },
    );
    return () => {
      current = false;
    };
  }, [text, kind]);
  return { stats, error };
}

export function StatsTab({
  stats,
  error,
  kind,
  onShow,
}: {
  stats: FullStats | null;
  error: boolean;
  kind: 'prose' | 'poem';
  onShow: (from: number, to: number) => void;
}) {
  const prefs = useAnalysisPrefs();
  const barId = useId();
  if (error) return <p role="alert">Vlo could not count this item. Close Insights and try again.</p>;
  if (!stats) return <p className="text-muted">Counting.</p>;
  const r = stats.readability;
  return (
    <div className="grid gap-6 text-sm">
      <div className="flex items-center justify-between gap-3 rounded-md border border-rule p-3">
        <label htmlFor={barId}>Show the stats bar under the text</label>
        <Switch
          id={barId}
          checked={prefs.bar}
          onCheckedChange={(bar) => {
            setAnalysisPrefs({ bar });
          }}
        />
      </div>
      <Section title="Counts">
        <dl className="grid gap-1.5">
          <Row term="Words" value={numbers.format(stats.words)} />
          <Row term="Characters" value={numbers.format(stats.characters)} />
          <Row term="Characters without spaces" value={numbers.format(stats.charactersNoSpaces)} />
          <Row term="Letters and digits" value={numbers.format(stats.letters)} />
          <Row term="Sentences" value={numbers.format(stats.sentences)} />
          <Row term={kind === 'poem' ? 'Lines' : 'Paragraphs'} value={numbers.format(stats.paragraphs)} />
          <Row term="Syllables" value={numbers.format(stats.syllables)} />
          <Row
            term="Unique words"
            value={`${numbers.format(stats.uniqueWords)} (${percent(stats.uniqueShare)})`}
          />
          <Row term="Pages, single-spaced" value={String(Math.round(stats.pagesSingle * 10) / 10)} />
          <Row term="Pages, double-spaced" value={String(Math.round(stats.pagesDouble * 10) / 10)} />
        </dl>
      </Section>
      <Section title="Time">
        <dl className="grid gap-1.5">
          <Row
            term="Reading, silent"
            value={durationLabel(stats.readingMinutes)}
            note="At 238 words a minute."
          />
          <Row
            term="Speaking, out loud"
            value={durationLabel(stats.speakingMinutes)}
            note="At 150 words a minute."
          />
          <Row
            term="Handwriting"
            value={durationLabel(stats.handwritingMinutes)}
            note="At 13 words a minute."
          />
          <Row term="Typing" value={durationLabel(stats.typingMinutes)} note="At 40 words a minute." />
        </dl>
      </Section>
      <Section title="Sentences and words">
        <dl className="grid gap-1.5">
          <Row term="Average sentence" value={`${String(stats.averageSentenceWords)} words`} />
          <Row
            term="Sentence length spread"
            value={`${String(stats.sentenceSpread)} words`}
            note="A larger spread gives the text more rhythm. Very even sentences can read flat."
          />
          <Row
            term={kind === 'poem' ? 'Average line' : 'Average paragraph'}
            value={`${String(stats.averageParagraphWords)} words`}
          />
          <Row
            term="Average word"
            value={`${String(stats.averageWordLength)} letters, ${String(stats.averageSyllables)} syllables`}
          />
          <Row term="Words of 3 or more syllables" value={numbers.format(stats.complexWords)} />
          <Row term="Words of 1 syllable" value={numbers.format(stats.monosyllables)} />
          <Row
            term="Words ending in -ly"
            value={numbers.format(stats.adverbs)}
            note="Most of them are adverbs."
          />
          <Row
            term="Content words"
            value={percent(stats.lexicalDensity)}
            note="Lexical density: words other than small words such as 'the' and 'of'."
          />
        </dl>
        {stats.longestSentence && (
          <div className="grid gap-1 rounded-md border border-rule p-3">
            <p className="text-muted">Longest sentence, {String(stats.longestSentence.words)} words</p>
            <p className="line-clamp-3 font-manuscript">{stats.longestSentence.text}</p>
            <Button
              variant="ghost"
              className="justify-self-start px-2"
              onClick={() => {
                if (stats.longestSentence) onShow(stats.longestSentence.from, stats.longestSentence.to);
              }}
            >
              Show in the text
            </Button>
          </div>
        )}
        <SentenceList
          title={`Sentences over ${String(LONG_SENTENCE)} words: ${String(stats.longSentences.length)}`}
          notes={stats.longSentences}
          onShow={onShow}
        />
        <SentenceList
          title={`Possible passive voice: ${String(stats.passive.length)}`}
          notes={stats.passive}
          onShow={onShow}
        />
      </Section>
      {r && (
        <Section title="Readability">
          <p>
            Reading level: <strong className="font-medium">{r.level}</strong>, which is {r.ease}. This is the
            middle of the grade scores below.
          </p>
          <dl className="grid gap-1.5">
            <Row
              term="Flesch reading ease"
              value={String(r.fleschEase)}
              note="0 to 100. Higher is easier. 60 to 70 is plain English."
            />
            <Row
              term="Flesch-Kincaid grade"
              value={String(r.fleschKincaid)}
              note="Words per sentence and syllables per word."
            />
            <Row
              term="Gunning fog index"
              value={String(r.gunningFog)}
              note="Sentence length and words of 3 or more syllables."
            />
            <Row
              term="SMOG index"
              value={String(r.smog)}
              note="Words of 3 or more syllables. Best for 30 sentences or more."
            />
            <Row
              term="Coleman-Liau index"
              value={String(r.colemanLiau)}
              note="Letters per word and sentences per word."
            />
            <Row
              term="Automated readability index"
              value={String(r.automated)}
              note="Letters per word and words per sentence."
            />
            <Row term="Linsear Write" value={String(r.linsearWrite)} note="The first 100 words." />
          </dl>
          <p className="text-xs text-muted">
            The grade scores are United States school grades. Fiction with dialogue often scores low, and that
            is normal.
          </p>
        </Section>
      )}
    </div>
  );
}

function SentenceList({
  title,
  notes,
  onShow,
}: {
  title: string;
  notes: readonly { from: number; to: number; text: string }[];
  onShow: (from: number, to: number) => void;
}) {
  if (notes.length === 0) return <p className="text-muted">{title}</p>;
  return (
    <details className="rounded-md border border-rule p-3">
      <summary className="cursor-pointer">{title}</summary>
      <ul className="mt-2 grid gap-2">
        {notes.slice(0, 30).map((note) => (
          <li
            key={`${String(note.from)}-${String(note.to)}`}
            className="flex items-start justify-between gap-2"
          >
            <span className="line-clamp-2 font-manuscript">{note.text}</span>
            <Button
              variant="ghost"
              className="shrink-0 px-2"
              onClick={() => {
                onShow(note.from, note.to);
              }}
            >
              Show
            </Button>
          </li>
        ))}
      </ul>
    </details>
  );
}
