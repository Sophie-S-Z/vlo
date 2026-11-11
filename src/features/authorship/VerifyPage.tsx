import { FileCheck } from 'lucide-react';
import { useId, useRef, useState } from 'react';
import { useDocumentTitle } from '@/app/useDocumentTitle';
import { formatWords } from '@/features/library/format';
import { Button } from '@/ui/button';
import { cn } from '@/ui/cn';
import { downloadBytes } from '@/lib/download';
import { checkTimestamp, type TimestampCheck } from './ots';
import { verifyRecord, withTimestamp, type VerifyResult } from './verify';

/*
 * The check page of an authorship record (roadmap F54, plan Task K6). It reads the file in this browser
 * and sends nothing, so it works offline and with no account. Only "Check the timestamp" sends a request
 * (roadmap 2 F68): the hash of the proof goes to the calendar server and the Bitcoin block server.
 */

const when = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });
const number = new Intl.NumberFormat();
/** Larger than any record that a writer can make in a lifetime of writing. */
const MAX_FILE = 50 * 1024 * 1024;

const SOURCES = [
  ['typed', 'Typed'],
  ['pasted', 'Pasted or dropped'],
  ['dictated', 'Dictated'],
  ['ai', 'From the AI'],
  ['deleted', 'Deleted'],
] as const;

function Result({ result, name }: { result: VerifyResult; name: string }) {
  if (!result.ok)
    return (
      <div role="alert" className="grid gap-1 rounded-md border border-rule p-4">
        <p className="font-semibold">“{name}” does not pass the check.</p>
        <p>{result.entry === null ? result.reason : `Entry ${String(result.entry)}: ${result.reason}`}</p>
      </div>
    );
  return (
    <div role="status" className="grid gap-4 rounded-md border border-rule p-4">
      <p className="font-semibold">“{name}” passes the check.</p>
      <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1 tabular-nums">
        <dt className="text-muted">Writing time</dt>
        <dd>{number.format(result.totals.minutes)} minutes</dd>
        {SOURCES.map(([key, label]) => (
          <div key={key} className="contents">
            <dt className="text-muted">{label}</dt>
            <dd>{number.format(result.totals[key])} characters</dd>
          </div>
        ))}
        <dt className="text-muted">Length at the end</dt>
        <dd>{formatWords(result.words, 'words')}</dd>
        <dt className="text-muted">From</dt>
        <dd>
          <time dateTime={new Date(result.first).toISOString()}>{when.format(result.first)}</time> to{' '}
          <time dateTime={new Date(result.last).toISOString()}>{when.format(result.last)}</time>
        </dd>
      </dl>
      <div className="grid gap-1">
        <p className="text-sm text-muted">
          {result.devices.length === 1
            ? 'One device signed it:'
            : `${String(result.devices.length)} devices signed it:`}
        </p>
        <ul className="grid gap-1 text-sm">
          {result.devices.map((d) => (
            <li key={d.fingerprint}>
              <span className="font-mono">{d.fingerprint}</span>, {d.entries}{' '}
              {d.entries === 1 ? 'entry' : 'entries'}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/** The public timestamp of a record that passed (F68). Nothing leaves the page until the reader asks. */
function PublicTimestamp({
  timestamp,
  file,
  name,
}: {
  timestamp: { proof: Uint8Array; digest: Uint8Array };
  file: string;
  name: string;
}) {
  const id = useId();
  const [busy, setBusy] = useState(false);
  const [check, setCheck] = useState<TimestampCheck | null>(null);
  const run = async () => {
    setBusy(true);
    setCheck(await checkTimestamp(timestamp.proof, timestamp.digest));
    setBusy(false);
  };
  return (
    <section aria-labelledby={id} className="grid gap-3 rounded-md border border-rule p-4">
      <h2 id={id} className="font-semibold">
        Public timestamp
      </h2>
      <p className="text-sm text-muted">
        This record has a public timestamp. To check it, Vlo asks an OpenTimestamps server for the finished
        proof and asks mempool.space for the Bitcoin block. They get the hash of the proof, never the record.
      </p>
      <div>
        <Button type="button" variant="outline" disabled={busy} onClick={() => void run()}>
          {busy ? 'Checking the timestamp' : 'Check the timestamp'}
        </Button>
      </div>
      {check?.state === 'failed' ? (
        <p role="alert">The timestamp does not pass: {check.reason}</p>
      ) : (
        <p role="status" className="empty:hidden">
          {check?.state === 'pending' &&
            'Bitcoin has not confirmed this timestamp yet. That takes a few hours. Try again later.'}
          {check?.state === 'confirmed' && (
            <>
              Bitcoin block {number.format(check.height)} holds this record, so the record existed on{' '}
              <time dateTime={new Date(check.time).toISOString()}>{when.format(check.time)}</time>.
            </>
          )}
        </p>
      )}
      {check?.state === 'confirmed' && check.finished && (
        <div className="grid gap-2">
          <p className="text-sm text-muted">
            The proof is now complete. Save the finished record, so that a later check needs no calendar
            server.
          </p>
          <div>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                const finished = check.finished;
                if (finished)
                  downloadBytes(
                    name,
                    'application/json',
                    new TextEncoder().encode(withTimestamp(file, finished)),
                  );
              }}
            >
              Download the finished record
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}

export function VerifyPage() {
  useDocumentTitle('Check an authorship record');
  const inputId = useId();
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  // Each check gets a new number, so the timestamp part starts again for each file.
  const checks = useRef(0);
  const [checked, setChecked] = useState<{
    n: number;
    name: string;
    text: string;
    result: VerifyResult;
  } | null>(null);
  const [busy, setBusy] = useState(false);

  const check = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    try {
      const text = file.size > MAX_FILE ? '' : await file.text();
      const result: VerifyResult =
        file.size > MAX_FILE
          ? { ok: false, reason: 'This file is too large to be an authorship record.', entry: null }
          : await verifyRecord(text);
      setChecked({ n: (checks.current += 1), name: file.name, text, result });
    } catch {
      setChecked({
        n: (checks.current += 1),
        name: file.name,
        text: '',
        result: { ok: false, reason: 'This browser could not read the file.', entry: null },
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <article className="mx-auto grid max-w-prose gap-8">
      <header className="grid gap-2">
        <h1 className="font-display text-4xl font-semibold">Check an authorship record</h1>
        <p className="text-muted">
          A writer makes this file in Vlo, from Export. The check runs in this browser and sends nothing.
        </p>
      </header>

      <div
        onDragOver={(event) => {
          event.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => {
          setOver(false);
        }}
        onDrop={(event) => {
          event.preventDefault();
          setOver(false);
          void check(event.dataTransfer.files[0]);
        }}
        className={cn(
          'grid justify-items-center gap-3 rounded-[var(--radius-card)] border border-dashed border-rule p-8 text-center',
          over && 'border-accent bg-surface',
        )}
      >
        <FileCheck aria-hidden="true" className="size-8 text-accent-text" />
        <p>Drop a record file here, or pick one.</p>
        <Button type="button" disabled={busy} onClick={() => input.current?.click()}>
          {busy ? 'Checking the file' : 'Pick a file'}
        </Button>
        <label htmlFor={inputId} className="sr-only">
          Authorship record file
        </label>
        <input
          id={inputId}
          ref={input}
          type="file"
          accept=".json,application/json"
          className="sr-only"
          tabIndex={-1}
          onChange={(event) => {
            void check(event.target.files?.[0]);
            event.target.value = '';
          }}
        />
      </div>

      {checked && <Result result={checked.result} name={checked.name} />}
      {checked?.result.ok && checked.result.timestamp && (
        <PublicTimestamp
          key={checked.n}
          timestamp={checked.result.timestamp}
          file={checked.text}
          name={checked.name}
        />
      )}

      <section aria-labelledby={`${inputId}-proves`} className="grid gap-3">
        <h2 id={`${inputId}-proves`} className="font-display text-2xl font-semibold">
          What the check proves
        </h2>
        <ul className="grid list-disc gap-2 pl-6">
          <li>No one changed, removed or reordered an entry after Vlo signed it.</li>
          <li>The keys listed above signed the entries. Each device has its own key, made on it.</li>
        </ul>
        <h2 className="font-display text-2xl font-semibold">What it does not prove</h2>
        <ul className="grid list-disc gap-2 pl-6">
          <li>Who sat at the device. A key shows the device, not the person.</li>
          <li>
            That the words came from the writer's mind. Text that someone typed from another source counts as
            typed.
          </li>
          <li>
            The times of the entries. Each device's own clock gives them. A public timestamp proves only the
            date by which the whole record existed.
          </li>
          <li>That the record is complete. A writer can write in another app.</li>
        </ul>
      </section>
    </article>
  );
}
