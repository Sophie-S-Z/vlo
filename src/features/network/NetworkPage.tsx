import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useId, useRef, useState } from 'react';
import { useDocumentTitle } from '@/app/useDocumentTitle';
import { db, type AiMode, type NetPurpose, type NetworkLogEntry } from '@/lib/db';
import { Button } from '@/ui/button';

/*
 * The network log (spec section 10, F25, US09). Each request that leaves the device shows here, newest
 * first. With no request, the page says 0 and names the AI mode of each project, so a writer in Pen mode
 * can see that nothing left.
 */

const PURPOSE_LABEL: Record<NetPurpose, string> = {
  ai: 'AI request',
  'model-download': 'Model download',
  share: 'Share link',
  usage: 'Usage count',
};

const MODE_LABEL: Record<AiMode, string> = { pen: 'Pen', reader: 'Reader', cowriter: 'Co-writer' };

const time = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'medium' });
const numbers = new Intl.NumberFormat();

function sizeText(bytes: number): string {
  if (bytes < 1024) return `${numbers.format(bytes)} bytes`;
  return `${numbers.format(Math.round(bytes / 1024))} KB`;
}

/** What the projects allow, for the empty log. */
function modesText(modes: readonly AiMode[]): string {
  if (modes.length === 0) return 'This device has no project yet.';
  const open = modes.filter((m) => m !== 'pen');
  if (open.length === 0)
    return modes.length === 1
      ? 'Your project is in Pen mode, so Vlo sends nothing.'
      : `All ${String(modes.length)} projects are in Pen mode, so Vlo sends nothing.`;
  const counts = (['reader', 'cowriter'] as const)
    .map((mode) => ({ mode, n: open.filter((m) => m === mode).length }))
    .filter((c) => c.n > 0)
    .map((c) => `${String(c.n)} in ${MODE_LABEL[c.mode]} mode`);
  return `${counts.join(' and ')}. Nothing leaves until you ask the AI for something.`;
}

export function NetworkPage() {
  useDocumentTitle('Network log');
  const id = useId();
  const [purpose, setPurpose] = useState<NetPurpose | 'all'>('all');
  const [message, setMessage] = useState('');
  const [cleared, setCleared] = useState<NetworkLogEntry[] | null>(null);
  const undoRef = useRef<HTMLButtonElement>(null);
  const entries = useLiveQuery(() => db.networkLog.orderBy('at').reverse().toArray(), []);
  const modes = useLiveQuery(async () => (await db.projects.toArray()).map((p) => p.aiMode), []);

  useEffect(() => {
    if (cleared) undoRef.current?.focus();
  }, [cleared]);

  if (entries === undefined || modes === undefined) return null;
  const shown = purpose === 'all' ? entries : entries.filter((e) => e.purpose === purpose);

  return (
    <section className="grid gap-6">
      <header className="grid max-w-prose gap-2">
        <h1 className="font-display text-4xl font-semibold">Network log</h1>
        <p className="text-muted">
          Each request that leaves this device shows here: where it went, why, and how much it sent. The log
          never keeps your text, a key or a header.
        </p>
      </header>

      <p className="font-display text-2xl" data-testid="network-count">
        {entries.length === 0
          ? '0 requests.'
          : `${numbers.format(entries.length)} ${entries.length === 1 ? 'request' : 'requests'}.`}{' '}
        <span className="font-ui text-base text-muted">{modesText(modes)}</span>
      </p>

      {entries.length > 0 && (
        <div className="grid gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <label htmlFor={`${id}-purpose`} className="text-sm text-muted">
              Show
            </label>
            <select
              id={`${id}-purpose`}
              value={purpose}
              onChange={(event) => {
                setPurpose(event.target.value as NetPurpose | 'all');
              }}
              className="min-h-11 rounded-md border border-rule bg-bg px-3 text-sm"
            >
              <option value="all">Every request</option>
              {(Object.keys(PURPOSE_LABEL) as NetPurpose[]).map((p) => (
                <option key={p} value={p}>
                  {PURPOSE_LABEL[p]}
                </option>
              ))}
            </select>
            <Button
              variant="outline"
              className="ml-auto"
              onClick={() => {
                const all = entries;
                db.networkLog.clear().then(
                  () => {
                    setCleared(all);
                    setMessage(`Cleared ${numbers.format(all.length)} log entries.`);
                  },
                  () => {
                    setMessage('Vlo could not clear the log on this device.');
                  },
                );
              }}
            >
              Clear log
            </Button>
          </div>
          <table className="w-full border-collapse text-sm">
            <caption className="sr-only">Requests that left this device, newest first</caption>
            {/* Phones show each request as a small block with its own labels, so the header row hides there. */}
            <thead className="max-sm:hidden">
              <tr className="border-b border-rule text-left text-muted">
                <th scope="col" className="py-2 pr-3 font-medium">
                  Time
                </th>
                <th scope="col" className="py-2 pr-3 font-medium">
                  Purpose
                </th>
                <th scope="col" className="py-2 pr-3 font-medium">
                  Host and path
                </th>
                <th scope="col" className="py-2 pr-3 font-medium">
                  Sent
                </th>
                <th scope="col" className="py-2 font-medium">
                  Answer
                </th>
              </tr>
            </thead>
            <tbody>
              {shown.map((entry) => (
                <tr
                  key={entry.id}
                  className="grid grid-cols-2 gap-x-3 gap-y-1 border-b border-rule py-3 align-top sm:table-row sm:py-0"
                >
                  <td className="col-span-2 text-muted sm:py-2 sm:pr-3 sm:whitespace-nowrap sm:text-text">
                    <time dateTime={new Date(entry.at).toISOString()}>{time.format(entry.at)}</time>
                  </td>
                  <td className="col-span-2 font-medium sm:py-2 sm:pr-3 sm:font-normal">
                    {PURPOSE_LABEL[entry.purpose]}
                  </td>
                  <td className="col-span-2 font-mono text-xs [overflow-wrap:anywhere] sm:py-2 sm:pr-3">
                    {entry.host}
                    {entry.path}
                  </td>
                  <td className="sm:py-2 sm:pr-3 sm:whitespace-nowrap">
                    <span className="text-muted sm:hidden">Sent </span>
                    {sizeText(entry.bytesSent)}
                  </td>
                  <td className="sm:py-2">
                    <span className="text-muted sm:hidden">Answer </span>
                    {entry.status === 'error' ? 'No answer' : `HTTP ${String(entry.status)}`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {shown.length === 0 && <p className="text-sm text-muted">No request of this kind is in the log.</p>}
        </div>
      )}

      <div className="flex min-h-11 flex-wrap items-center gap-3 text-sm">
        <p role="status" className="text-muted">
          {message}
        </p>
        {cleared && (
          <Button
            ref={undoRef}
            variant="outline"
            onClick={() => {
              const rows = cleared;
              db.networkLog.bulkPut(rows).then(
                () => {
                  setCleared(null);
                  setMessage(`Restored ${numbers.format(rows.length)} log entries.`);
                },
                () => {
                  setMessage('Vlo could not restore the log on this device.');
                },
              );
            }}
          >
            Undo
          </Button>
        )}
      </div>
    </section>
  );
}
