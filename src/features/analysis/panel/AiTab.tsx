import { lazy, Suspense, useState } from 'react';
import { Button } from '@/ui/button';
import { LOW_SHARE, MIN_REPORT_WORDS, SIGNAL_LABEL, tellsByGroup, type AiReport } from '../ai/detect';
import { FLAG_INFO, type FlagKind } from '../ai/integrity';
import { TELL_INFO } from '../ai/tells';
import { aiCheckInWorker } from '../analysisClient';

// The deep check loads only in Reader or Co-writer mode, so a project in Pen mode loads none of its AI code.
const DeepCheck = lazy(async () => ({ default: (await import('./DeepCheck')).DeepCheck }));

/*
 * The AI check report. It leads with a plain result in three bands, then shows why: the measures that
 * moved the score, the passages with the strongest signs, the phrases from the Humanizer catalog, and
 * text tricks such as hidden characters. Vlo's own co-writer marks are a fact, not a guess, so they come
 * first when the item has any.
 */

const numbers = new Intl.NumberFormat();
const pct = (value: number) => `${String(Math.round(value * 100))}%`;

interface Passage {
  from: number;
  to: number;
  score: number;
}

/** Joins marked sentences that follow each other into passages. */
function passagesOf(report: AiReport, text: string): (Passage & { text: string })[] {
  const found: Passage[] = [];
  for (const sentence of report.sentences) {
    if (!sentence.marked) continue;
    const last = found.at(-1);
    if (last && text.slice(last.to, sentence.from).trim() === '') {
      last.to = sentence.to;
      last.score = Math.max(last.score, sentence.score);
    } else found.push({ from: sentence.from, to: sentence.to, score: sentence.score });
  }
  return found.map((passage) => ({ ...passage, text: text.slice(passage.from, passage.to) }));
}

const BAND_TEXT = {
  many: {
    title: 'Many signs of AI writing',
    body: 'The style of this text is close to the AI texts that the model learned from. In tests, about 1 in 100 human texts scored this high.',
  },
  some: {
    title: 'Some signs of AI writing',
    body: 'The text has some habits of AI writing. Many human texts score in this range too, so this result does not tell you who wrote it.',
  },
  few: {
    title: 'Few signs of AI writing',
    body: 'The style of this text is close to the human texts that the model learned from. Edited or newer AI text can also score low.',
  },
} as const;

export function AiTab({
  text,
  provenance,
  deepCheck,
  onShow,
}: {
  text: string;
  provenance: { ai: number; total: number };
  /** True in Reader or Co-writer mode. */
  deepCheck: boolean;
  onShow: (from: number, to: number) => void;
}) {
  const [report, setReport] = useState<AiReport | null>(null);
  const [status, setStatus] = useState<'idle' | 'running' | 'error'>('idle');

  const run = () => {
    setStatus('running');
    aiCheckInWorker(text).then(
      (next) => {
        setReport(next);
        setStatus('idle');
      },
      () => {
        setStatus('error');
      },
    );
  };

  return (
    <div className="grid gap-5 text-sm">
      <p className="text-muted">
        The check runs on this device. No text leaves it. It looks at style, so it gives a likelihood, never
        proof.
      </p>
      {provenance.ai > 0 ? (
        <p className="rounded-md border border-accent p-3">
          Vlo&apos;s co-writer wrote {numbers.format(provenance.ai)} of the {numbers.format(provenance.total)}{' '}
          words in this item ({pct(provenance.ai / Math.max(1, provenance.total))}). This is a record, not a
          guess: Vlo marks co-writer text when you insert it, and &quot;Show AI text&quot; draws the marks.
        </p>
      ) : (
        <p>No text in this item came from Vlo&apos;s co-writer.</p>
      )}
      <Button onClick={run} disabled={status === 'running'} className="justify-self-start">
        {status === 'running' ? 'Checking.' : report ? 'Check again' : 'Check this item'}
      </Button>
      <p role="status" className={status === 'error' ? 'text-accent-text' : 'sr-only'}>
        {status === 'error'
          ? 'Vlo could not run the check. Try again.'
          : status === 'running'
            ? 'Checking.'
            : report
              ? 'The check is done.'
              : ''}
      </p>
      {report && <AiResult report={report} text={text} onShow={onShow} />}
      {deepCheck ? (
        <Suspense fallback={<p className="text-muted">Loading the deep check.</p>}>
          <DeepCheck text={text} styleBand={report?.enough ? report.band : null} onShow={onShow} />
        </Suspense>
      ) : (
        <p className="text-muted">
          The deep check loads a language model, so it works only in Reader or Co-writer mode. Choose the AI
          mode button to switch this project.
        </p>
      )}
      <details className="rounded-md border border-rule p-3">
        <summary className="cursor-pointer font-medium">How the check works, and its limits</summary>
        <div className="mt-2 grid gap-2 text-muted">
          <p>
            A small model on this device reads about 170 style measures: sentence rhythm, word choice,
            punctuation, common words, and the phrases that the Humanizer guide lists. It learned from about
            19,000 texts of human and AI writing (ChatGPT and Claude), including essays by learners of English
            and published fiction.
          </p>
          <p>
            On 4,784 test texts that it never saw, it caught 98% of the AI texts and flagged 1.3% of the human
            texts. It caught 97% of AI texts that a paraphrasing tool changed. It flagged none of 270 passages
            of published fiction, and under 1% of essays by learners of English.
          </p>
          <p>
            Newer models and AI text that a person edits are harder. In a test of 14 texts by a 2026 model, it
            caught only 3. Turnitin and other detectors share this limit, and they do not publish how they
            work. The deep check, below the result, measures the text in a different way, with a language
            model.
          </p>
          <p>
            Do not use this result alone to decide that a person used AI. Look at the marked passages, and ask
            about the writing process. Vlo&apos;s history snapshots show how a text grew.
          </p>
        </div>
      </details>
    </div>
  );
}

function AiResult({
  report,
  text,
  onShow,
}: {
  report: AiReport;
  text: string;
  onShow: (from: number, to: number) => void;
}) {
  const passages = passagesOf(report, text);
  const groups = tellsByGroup(report.tells);
  const flagKinds = [...new Set(report.flags.map((flag) => flag.kind))] as FlagKind[];
  return (
    <div className="grid gap-5">
      {report.enough ? (
        <section className="grid gap-1 rounded-md border border-rule p-3" aria-label="Result">
          <p className="font-display text-xl font-semibold">{BAND_TEXT[report.band].title}</p>
          <p>{BAND_TEXT[report.band].body}</p>
          <p className="text-muted">
            Model score {String(Math.round(report.score * 100))} of 100. The bands start at{' '}
            {String(Math.round(report.cuts.some * 100))} and {String(Math.round(report.cuts.many * 100))}.
          </p>
          <p>
            {report.share === 0
              ? 'No passage has strong signs.'
              : report.share < LOW_SHARE
                ? 'Under 20% of the text is in passages with strong signs. Vlo does not show a number below 20%, because false alarms are most common there.'
                : `${pct(report.share)} of the text is in passages with strong signs.`}
          </p>
        </section>
      ) : (
        <p className="rounded-md border border-rule p-3">
          This item has {numbers.format(report.words)} words. The check gives an overall result at{' '}
          {String(MIN_REPORT_WORDS)} words or more, because a short text gives too little to measure. The
          signs below still apply.
        </p>
      )}

      {report.signals.length > 0 && (
        <section className="grid gap-2">
          <h3 className="font-medium">What moved the score</h3>
          <ul className="grid gap-1">
            {report.signals.slice(0, 5).map((signal) => (
              <li key={signal.group} className="flex items-baseline justify-between gap-3">
                <span>{SIGNAL_LABEL[signal.group]}</span>
                <span className="font-mono text-muted">
                  {Math.abs(signal.weight) < 0.25
                    ? 'little effect'
                    : signal.weight > 0
                      ? 'more like AI'
                      : 'more like a person'}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {passages.length > 0 && (
        <section className="grid gap-2">
          <h3 className="font-medium">Passages with the strongest signs: {String(passages.length)}</h3>
          <ul className="grid gap-2">
            {passages.slice(0, 20).map((passage) => (
              <li key={passage.from} className="grid gap-1 rounded-md border border-rule p-3">
                <p className="line-clamp-4 font-manuscript">{passage.text}</p>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs text-muted">Score {String(Math.round(passage.score * 100))}</span>
                  <Button
                    variant="ghost"
                    className="px-2"
                    onClick={() => {
                      onShow(passage.from, passage.to);
                    }}
                  >
                    Show in the text
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="grid gap-2">
        <h3 className="font-medium">Habits of AI writing (Humanizer signs)</h3>
        <p className="text-muted">
          {numbers.format(report.tells.length)} signs, {String(Math.round(report.tellRate * 10) / 10)} for
          each 100 words.{' '}
          {report.tellLevel === 'typical'
            ? 'That is typical of human writing.'
            : report.tellLevel === 'above'
              ? 'That is more than half of human texts have.'
              : 'That is more than 99 of 100 human texts have.'}{' '}
          People use these phrases too. Each one is a place to check, not proof.
        </p>
        {groups.length === 0 ? (
          <p>No signs found.</p>
        ) : (
          <ul className="grid gap-2">
            {groups.map(({ group, tells }) => {
              const examples = [...new Set(tells.map((tell) => tell.text.toLowerCase()))].slice(0, 6);
              const first = tells[0];
              return (
                <li key={group} className="grid gap-1 rounded-md border border-rule p-3">
                  <p className="flex justify-between gap-2">
                    <span className="font-medium">{TELL_INFO[group].label}</span>
                    <span className="font-mono">{String(tells.length)}</span>
                  </p>
                  <p className="font-manuscript [overflow-wrap:anywhere]">
                    {examples.map((e) => `"${e}"`).join(', ')}
                  </p>
                  <p className="text-muted">{TELL_INFO[group].advice}</p>
                  {first && (
                    <Button
                      variant="ghost"
                      className="justify-self-start px-2"
                      onClick={() => {
                        onShow(first.from, first.to);
                      }}
                    >
                      Show the first one
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="grid gap-2">
        <h3 className="font-medium">Hidden text tricks</h3>
        {flagKinds.length === 0 ? (
          <p>None found: no invisible characters, no look-alike letters and no odd spaces.</p>
        ) : (
          <ul className="grid gap-2">
            {flagKinds.map((kind) => {
              const flags = report.flags.filter((flag) => flag.kind === kind);
              const first = flags[0];
              return (
                <li key={kind} className="grid gap-1 rounded-md border border-accent p-3">
                  <p className="flex justify-between gap-2">
                    <span className="font-medium">{FLAG_INFO[kind].label}</span>
                    <span className="font-mono">{String(flags.length)}</span>
                  </p>
                  <p className="text-muted">{FLAG_INFO[kind].advice}</p>
                  {first && (
                    <Button
                      variant="ghost"
                      className="justify-self-start px-2"
                      onClick={() => {
                        onShow(first.from, first.to);
                      }}
                    >
                      Show the first one ({first.detail})
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
