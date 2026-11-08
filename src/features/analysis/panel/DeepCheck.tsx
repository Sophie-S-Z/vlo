import { useEffect, useId, useRef, useState } from 'react';
import { EngineError, isAbort } from '@/features/ai/engine/types';
import { hasWebGpu, loadWebLlmScorer, WEBLLM_MODELS } from '@/features/ai/engine/webllm';
import { loadEngineChoice } from '@/features/ai/settings';
import { Button } from '@/ui/button';
import { LOW_SHARE } from '../ai/detect';
import { REFERENCES } from '../deep/references';
import { forgetCalibration, runCalibration, runDeepCheck, savedCalibration } from '../deep/run';
import { agreement, MIN_REPORT_TOKENS, type DeepBand, type DeepReport } from '../deep/score';

/*
 * The deep AI check: a language model in this browser reads the text and measures how predictable each
 * word is. It is a second, separate opinion next to the style check. The first run for a model sets the
 * cuts on this device from reference passages, and the result says how well they worked here.
 */

const numbers = new Intl.NumberFormat();
const pct = (value: number) => `${String(Math.round(value * 100))}%`;

const selectClass =
  'min-h-11 w-full rounded-md border border-rule bg-bg px-3 text-base text-text focus-visible:border-accent';

type Status =
  | { kind: 'idle' }
  | { kind: 'loading'; share: number }
  | { kind: 'calibrating'; done: number; total: number }
  | { kind: 'reading'; done: number; total: number }
  | { kind: 'error'; message: string };

const BAND_TEXT = {
  many: {
    title: 'The model finds this text very predictable',
    body: 'AI writing picks the words that a model expects. On the reference passages, about 1 in 100 human texts is expected to score this high.',
  },
  some: {
    title: 'The model finds this text quite predictable',
    body: 'Plain, formal or very edited human writing can score in this range too, so this result does not tell you who wrote it.',
  },
  few: {
    title: 'The model finds this text as surprising as human writing',
    body: 'Human writing picks words that a model does not always expect. AI text that a person rewrote can score low too.',
  },
} as const;

function markedPassages(report: DeepReport, text: string) {
  const found: { from: number; to: number }[] = [];
  for (const sentence of report.sentences) {
    if (!sentence.marked) continue;
    const last = found.at(-1);
    if (last && text.slice(last.to, sentence.from).trim() === '') last.to = sentence.to;
    else found.push({ from: sentence.from, to: sentence.to });
  }
  return found.map((p) => ({ ...p, text: text.slice(p.from, p.to) }));
}

export function DeepCheck({
  text,
  styleBand,
  onShow,
}: {
  text: string;
  /** The band of the style check, when it has an overall result. */
  styleBand: DeepBand | null;
  onShow: (from: number, to: number) => void;
}) {
  const [model, setModel] = useState(WEBLLM_MODELS[0]?.id ?? '');
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  const [report, setReport] = useState<DeepReport | null>(null);
  const stop = useRef<AbortController | null>(null);
  const modelId = useId();

  useEffect(() => {
    let current = true;
    void loadEngineChoice().then((choice) => {
      if (current && choice.kind === 'webllm') setModel(choice.model);
    });
    return () => {
      current = false;
      stop.current?.abort();
    };
  }, []);

  const busy = status.kind === 'loading' || status.kind === 'calibrating' || status.kind === 'reading';

  const run = async (again = false) => {
    const controller = new AbortController();
    stop.current = controller;
    try {
      if (!(await hasWebGpu()))
        throw new EngineError(
          'no-gpu',
          'This browser has no WebGPU, so it cannot run the deep check. Use a recent Chrome, Edge or Safari.',
        );
      setStatus({ kind: 'loading', share: 0 });
      const scorer = await loadWebLlmScorer(model, (share) => {
        setStatus({ kind: 'loading', share });
      });
      if (again) await forgetCalibration(model);
      let calibration = await savedCalibration(model);
      if (!calibration) {
        setStatus({ kind: 'calibrating', done: 0, total: 1 });
        calibration = await runCalibration(scorer, controller.signal, (done, total) => {
          setStatus({ kind: 'calibrating', done, total });
        });
      }
      setStatus({ kind: 'reading', done: 0, total: 1 });
      const next = await runDeepCheck(text, scorer, calibration, controller.signal, (done, total) => {
        setStatus({ kind: 'reading', done, total });
      });
      setReport(next);
      setStatus({ kind: 'idle' });
    } catch (problem) {
      if (isAbort(problem) || controller.signal.aborted) setStatus({ kind: 'idle' });
      else
        setStatus({
          kind: 'error',
          message: problem instanceof Error ? problem.message : 'Vlo could not run the deep check.',
        });
    } finally {
      if (stop.current === controller) stop.current = null;
    }
  };

  const label = WEBLLM_MODELS.find((m) => m.id === model);

  return (
    <section className="grid gap-3 rounded-md border border-rule p-3" aria-labelledby={`${modelId}-title`}>
      <h3 id={`${modelId}-title`} className="font-medium">
        Deep check, with a language model
      </h3>
      <p className="text-muted">
        A language model in this browser reads the text and measures how predictable each word is. This is a
        second opinion that does not use the style measures above. It needs WebGPU. The first run downloads
        the model ({label?.download ?? 'about 1 GB'}), unless the co-writer already uses it. No text leaves
        this device.
      </p>
      <div className="grid gap-1.5">
        <label htmlFor={modelId}>Model</label>
        <select
          id={modelId}
          className={selectClass}
          value={model}
          disabled={busy}
          onChange={(event) => {
            setModel(event.target.value);
            setReport(null);
          }}
        >
          {WEBLLM_MODELS.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label}, {m.download}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          onClick={() => {
            void run();
          }}
          disabled={busy}
        >
          {report ? 'Run the deep check again' : 'Run the deep check'}
        </Button>
        {busy && (
          <Button
            variant="ghost"
            onClick={() => {
              stop.current?.abort();
            }}
          >
            Stop
          </Button>
        )}
      </div>
      <p role="status" className={status.kind === 'error' ? 'text-accent-text' : 'text-muted'}>
        {status.kind === 'loading'
          ? `Loading the model: ${pct(status.share)}.`
          : status.kind === 'calibrating'
            ? `Setting up this device for the model: ${pct(status.done / Math.max(1, status.total))}. This happens once. The check reads ${String(REFERENCES.length)} reference passages to set its cuts.`
            : status.kind === 'reading'
              ? `Reading the text: ${numbers.format(status.done)} of ${numbers.format(status.total)} tokens.`
              : status.kind === 'error'
                ? status.message
                : report
                  ? 'The deep check is done.'
                  : ''}
      </p>
      {report && (
        <DeepResult
          report={report}
          text={text}
          styleBand={styleBand}
          onShow={onShow}
          onRecalibrate={() => {
            void run(true);
          }}
          busy={busy}
        />
      )}
    </section>
  );
}

function DeepResult({
  report,
  text,
  styleBand,
  onShow,
  onRecalibrate,
  busy,
}: {
  report: DeepReport;
  text: string;
  styleBand: DeepBand | null;
  onShow: (from: number, to: number) => void;
  onRecalibrate: () => void;
  busy: boolean;
}) {
  const c = report.calibration;
  const passages = markedPassages(report, text);
  return (
    <div className="grid gap-3">
      {!c.useful && (
        <p className="rounded-md border border-accent p-3">
          On this device, the model caught only {String(c.ai.caught)} of {String(c.ai.count)} AI reference
          passages. Its result means little here. Rely on the style check, or try the other model.
        </p>
      )}
      {report.enough ? (
        <div className="grid gap-1">
          <p className="font-display text-lg font-semibold">{BAND_TEXT[report.band].title}</p>
          <p>{BAND_TEXT[report.band].body}</p>
          <p className="text-muted">
            Score {report.score.toFixed(2)}. The bands start at {c.cuts.some.toFixed(2)} and{' '}
            {c.cuts.many.toFixed(2)}.
          </p>
          {styleBand && <p className="font-medium">{agreement(styleBand, report.band)}</p>}
          <p>
            {report.share === 0
              ? 'No passage is very predictable.'
              : report.share < LOW_SHARE
                ? 'Under 20% of the text is in very predictable passages.'
                : `${pct(report.share)} of the text that the check read is in very predictable passages.`}
          </p>
        </div>
      ) : (
        <p>
          The check read {numbers.format(report.tokens)} tokens. It gives an overall result at{' '}
          {String(MIN_REPORT_TOKENS)} tokens or more, about 75 words.
        </p>
      )}
      {report.wordsRead < report.words && (
        <p className="text-muted">
          The check read {numbers.format(report.wordsRead)} of the {numbers.format(report.words)} words, in
          parts from the whole text.
        </p>
      )}
      {passages.length > 0 && (
        <ul className="grid gap-2">
          {passages.slice(0, 12).map((passage) => (
            <li key={passage.from} className="grid gap-1 rounded-md border border-rule p-3">
              <p className="line-clamp-4 font-manuscript">{passage.text}</p>
              <Button
                variant="ghost"
                className="justify-self-start px-2"
                onClick={() => {
                  onShow(passage.from, passage.to);
                }}
              >
                Show in the text
              </Button>
            </li>
          ))}
        </ul>
      )}
      <details className="text-muted">
        <summary className="cursor-pointer">How the deep check works, and how it did on this device</summary>
        <div className="mt-2 grid gap-2">
          <p>
            For each word, the model gives the chance of every word that could come next. The check compares
            the chance of the real word with the chance that the model expects on average. This is the
            Fast-DetectGPT method. AI text scores high, because AI models pick likely words.
          </p>
          <p>
            The first run read {String(c.human.count)} human passages (public domain books, State of the Union
            addresses and European Parliament debates) and {String(c.ai.count)} AI passages. It set the cuts
            from the human scores. On this device, the &quot;many&quot; cut flagged {String(c.human.flagged)}{' '}
            of the {String(c.human.count)} human passages and caught {String(c.ai.caught)} of the{' '}
            {String(c.ai.count)} AI passages.
          </p>
          <p>
            This check has limits. Text that a model knows by heart, such as famous quotes, scores high.
            Simple writing by learners of English can score high too. Very short texts give too little to
            measure. Do not use this result alone to decide that a person used AI.
          </p>
          <Button variant="ghost" className="justify-self-start px-2" onClick={onRecalibrate} disabled={busy}>
            Set up this device again
          </Button>
        </div>
      </details>
    </div>
  );
}
