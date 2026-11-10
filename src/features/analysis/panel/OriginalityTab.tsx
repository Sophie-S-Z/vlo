import { useEffect, useId, useRef, useState } from 'react';
import { privatePeople } from '@/features/people/people';
import { Button } from '@/ui/button';
import { Input } from '@/ui/input';
import { Textarea } from '@/ui/textarea';
import { originalityInWorker } from '../analysisClient';
import {
  DEFAULT_OPTIONS,
  searchPhrases,
  type MatchOptions,
  type OriginalityReport,
  type Source,
} from '../originality/match';
import {
  addPastedSource,
  ownSources,
  pastedAsSources,
  pastedSources,
  removePastedSource,
  type PastedSource,
} from '../originality/sources';
import { WEB_PHRASES, webSources } from '../originality/web';

/*
 * The originality report, in the shape of a similarity report: one overall percent, the sources in order of
 * their share, and each match with the source text beside it. "Check on this device" sends nothing. "Check
 * the web too" sends a few short phrases to Wikipedia and OpenAlex, after the writer presses it.
 */

const pct = (value: number) => `${String(Math.round(value * 1000) / 10)}%`;
const numbers = new Intl.NumberFormat();

/** A link only for an http or https address, so a pasted "javascript:" link never runs. */
export function safeLink(url: string | undefined): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:' ? parsed.href : null;
  } catch {
    return null;
  }
}

const ORIGIN_LABEL = { own: 'Your writing', pasted: 'Pasted source', web: 'Web' } as const;

export function OriginalityTab({
  text,
  markedNames,
  itemId,
  projectId,
  onShow,
}: {
  text: string;
  /** The names that the writer marked in this item, which can differ from every name on the People screen. */
  markedNames: readonly string[];
  itemId: string;
  projectId: string;
  onShow: (from: number, to: number) => void;
}) {
  const [options, setOptions] = useState<MatchOptions>(DEFAULT_OPTIONS);
  const [everyProject, setEveryProject] = useState(true);
  const [pasted, setPasted] = useState<PastedSource[]>([]);
  const [report, setReport] = useState<OriginalityReport | null>(null);
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const [webNote, setWebNote] = useState('');
  const abort = useRef<AbortController | null>(null);
  const minId = useId();

  useEffect(() => {
    let current = true;
    void pastedSources(projectId).then((list) => {
      if (current) setPasted(list);
    });
    return () => {
      current = false;
      abort.current?.abort();
    };
  }, [projectId]);

  const run = async (web: boolean) => {
    setBusy(true);
    setWebNote('');
    setStatus(web ? 'Searching Wikipedia and OpenAlex.' : 'Checking.');
    try {
      const sources: Source[] = [
        ...(await ownSources(itemId, projectId, everyProject)),
        ...pastedAsSources(pasted),
      ];
      if (web) {
        abort.current?.abort();
        const controller = new AbortController();
        abort.current = controller;
        const people = await privatePeople(projectId);
        const names = [...people.flatMap((p) => p.variants.map((v) => v.real)), ...markedNames];
        const phrases = searchPhrases(text, WEB_PHRASES, options, names);
        const found = await webSources(phrases, controller.signal);
        sources.push(...found.sources);
        setWebNote(
          `Vlo sent ${String(phrases.length)} short ${phrases.length === 1 ? 'phrase' : 'phrases'} in ${String(found.requests)} requests and compared ${String(found.sources.length)} web ${found.sources.length === 1 ? 'page' : 'pages'}.` +
            (found.failed.length > 0
              ? ` ${found.failed.join(' and ')} did not answer, so the result can miss a source.`
              : ''),
        );
      }
      setStatus('Comparing.');
      const next = await originalityInWorker(text, sources, options);
      setReport(next);
      setStatus('The check is done.');
    } catch {
      setStatus('Vlo could not finish the check. Try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid gap-5 text-sm">
      <p className="text-muted">
        The check compares this item with your other writing and with sources that you add. It finds copied
        runs of words and close paraphrases. &quot;Check the web too&quot; also searches Wikipedia and
        research papers.
      </p>
      <fieldset className="grid gap-2 rounded-md border border-rule p-3">
        <legend className="px-1 font-medium">Options</legend>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={options.excludeQuotes}
            onChange={(event) => {
              setOptions({ ...options, excludeQuotes: event.target.checked });
            }}
          />
          Leave out text in quotation marks
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={options.excludeReferences}
            onChange={(event) => {
              setOptions({ ...options, excludeReferences: event.target.checked });
            }}
          />
          Leave out a reference list (after a &quot;References&quot; or &quot;Works Cited&quot; line)
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={everyProject}
            onChange={(event) => {
              setEveryProject(event.target.checked);
            }}
          />
          Compare with every project on this device, not only this one
        </label>
        <div className="flex items-center gap-2">
          <label htmlFor={minId}>Leave out matches under</label>
          <Input
            id={minId}
            type="number"
            min={5}
            max={40}
            className="w-20"
            value={options.minWords}
            onChange={(event) => {
              const value = Math.max(5, Math.min(40, Number(event.target.value) || DEFAULT_OPTIONS.minWords));
              setOptions({ ...options, minWords: value });
            }}
          />
          <span>words</span>
        </div>
      </fieldset>

      <PastedSources
        list={pasted}
        onAdd={async (source) => {
          setPasted(await addPastedSource(projectId, source));
        }}
        onRemove={async (id) => {
          setPasted(await removePastedSource(projectId, id));
        }}
      />

      <div className="flex flex-wrap gap-2">
        <Button
          disabled={busy}
          onClick={() => {
            void run(false);
          }}
        >
          Check on this device
        </Button>
        <Button
          variant="outline"
          disabled={busy}
          onClick={() => {
            void run(true);
          }}
        >
          Check the web too
        </Button>
      </div>
      <p className="text-xs text-muted">
        The web check sends up to {String(WEB_PHRASES)} short phrases of this item to Wikipedia and OpenAlex,
        never the whole text. The network log lists each request. Both services are free. No free service can
        search student papers or paid journals, as Turnitin does, so a clean result is not a guarantee.
      </p>
      <p role="status" className={status ? '' : 'sr-only'}>
        {status}
      </p>
      {webNote && <p className="text-muted">{webNote}</p>}
      {report && <OriginalityResult report={report} text={text} onShow={onShow} />}
    </div>
  );
}

function PastedSources({
  list,
  onAdd,
  onRemove,
}: {
  list: readonly PastedSource[];
  onAdd: (source: Omit<PastedSource, 'id'>) => Promise<void>;
  onRemove: (id: string) => Promise<void>;
}) {
  const [title, setTitle] = useState('');
  const [url, setUrl] = useState('');
  const [body, setBody] = useState('');
  const titleId = useId();
  const urlId = useId();
  const bodyId = useId();
  return (
    <details className="rounded-md border border-rule p-3">
      <summary className="cursor-pointer font-medium">Your sources ({String(list.length)})</summary>
      <div className="mt-2 grid gap-3">
        <p className="text-muted">
          Paste the text of an article, a book chapter or a web page that you used. Vlo keeps it on this
          device, with this project.
        </p>
        {list.length > 0 && (
          <ul className="grid gap-1">
            {list.map((source) => (
              <li key={source.id} className="flex items-center justify-between gap-2">
                <span className="[overflow-wrap:anywhere]">{source.title}</span>
                <Button
                  variant="ghost"
                  className="px-2"
                  aria-label={`Remove ${source.title}`}
                  onClick={() => {
                    void onRemove(source.id);
                  }}
                >
                  Remove
                </Button>
              </li>
            ))}
          </ul>
        )}
        <form
          className="grid gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            if (title.trim() === '' || body.trim() === '') return;
            void onAdd({ title: title.trim(), text: body, ...(url.trim() ? { url: url.trim() } : {}) }).then(
              () => {
                setTitle('');
                setUrl('');
                setBody('');
              },
            );
          }}
        >
          <label htmlFor={titleId}>Title</label>
          <Input
            id={titleId}
            value={title}
            onChange={(event) => {
              setTitle(event.target.value);
            }}
          />
          <label htmlFor={urlId}>Link (optional)</label>
          <Input
            id={urlId}
            value={url}
            onChange={(event) => {
              setUrl(event.target.value);
            }}
          />
          <label htmlFor={bodyId}>Text</label>
          <Textarea
            id={bodyId}
            rows={5}
            value={body}
            onChange={(event) => {
              setBody(event.target.value);
            }}
          />
          <Button
            type="submit"
            variant="outline"
            className="justify-self-start"
            disabled={title.trim() === '' || body.trim() === ''}
          >
            Add the source
          </Button>
        </form>
      </div>
    </details>
  );
}

function OriginalityResult({
  report,
  text,
  onShow,
}: {
  report: OriginalityReport;
  text: string;
  onShow: (from: number, to: number) => void;
}) {
  const byId = new Map(report.sources.map((result) => [result.source.id, result.source]));
  return (
    <div className="grid gap-5">
      <section className="grid gap-1 rounded-md border border-rule p-3" aria-label="Result">
        <p className="font-display text-xl font-semibold">{pct(report.similarity)} similar</p>
        <p>
          {report.matches.length === 0
            ? `No matches in ${numbers.format(report.checkedWords)} checked words.`
            : `${numbers.format(report.matches.length)} ${report.matches.length === 1 ? 'match' : 'matches'} from ${numbers.format(report.sources.length)} ${report.sources.length === 1 ? 'source' : 'sources'}, in ${numbers.format(report.checkedWords)} checked words.`}
        </p>
        <p className="text-muted">
          A match is not always a problem. Quotations with credit, common phrases and your own earlier drafts
          all match. Look at each one.
        </p>
      </section>
      {report.sources.length > 0 && (
        <section className="grid gap-2">
          <h3 className="font-medium">Sources</h3>
          <ol className="grid gap-1">
            {report.sources.map((result) => (
              <li key={result.source.id} className="flex items-baseline justify-between gap-3">
                <span className="min-w-0 [overflow-wrap:anywhere]">
                  {safeLink(result.source.url) ? (
                    <a
                      href={safeLink(result.source.url) ?? undefined}
                      target="_blank"
                      rel="noreferrer"
                      className="underline"
                    >
                      {result.source.title}
                    </a>
                  ) : (
                    result.source.title
                  )}{' '}
                  <span className="text-muted">({ORIGIN_LABEL[result.source.origin]})</span>
                </span>
                <span className="tabular-nums">{pct(result.share)}</span>
              </li>
            ))}
          </ol>
        </section>
      )}
      {report.matches.length > 0 && (
        <section className="grid gap-2">
          <h3 className="font-medium">Matches</h3>
          <ul className="grid gap-2">
            {report.matches.slice(0, 50).map((match) => (
              <li
                key={`${match.sourceId}-${String(match.from)}`}
                className="grid gap-1 rounded-md border border-rule p-3"
              >
                <p className="text-xs text-muted">
                  {match.kind === 'copied' ? `Copied, ${String(match.words)} words` : 'Close paraphrase'} ·{' '}
                  {byId.get(match.sourceId)?.title ?? 'Source'}
                </p>
                <p className="line-clamp-3 font-manuscript">{text.slice(match.from, match.to)}</p>
                <p className="line-clamp-3 border-l-2 border-rule pl-2 text-muted">{match.sourceText}</p>
                <Button
                  variant="ghost"
                  className="justify-self-start px-2"
                  onClick={() => {
                    onShow(match.from, match.to);
                  }}
                >
                  Show in the text
                </Button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
