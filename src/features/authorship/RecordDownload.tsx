import { useId, useState } from 'react';
import { Link } from 'react-router';
import { exportFileName } from '@/features/export/build';
import type { Project } from '@/lib/db';
import { downloadBytes } from '@/lib/download';
import { Button } from '@/ui/button';
import { Label } from '@/ui/label';
import { Switch } from '@/ui/switch';
import { exportRecord, stampRecord } from './record';

/** The authorship record in the Export dialog (F54, plan Task K5). It works in every AI mode. */
export function RecordDownload({ project }: { project: Project }) {
  const id = useId();
  const [message, setMessage] = useState('');
  const [stamped, setStamped] = useState(false);
  const [busy, setBusy] = useState(false);
  const download = async () => {
    setBusy(true);
    try {
      let record = await exportRecord(project.id);
      if (record === null) {
        setMessage('This project has no record yet. Vlo starts it when you write.');
        return;
      }
      let note = '';
      if (stamped)
        try {
          record = await stampRecord(record);
          note = 'The record has a public timestamp. Bitcoin confirms it in a few hours.';
        } catch {
          // Never lose the record: it downloads with no timestamp.
          note = 'The timestamp servers did not answer, so this record has no timestamp. Try again later.';
        }
      const name = `${exportFileName(project.title)} authorship record.json`;
      downloadBytes(name, 'application/json', new TextEncoder().encode(record));
      setMessage(note);
    } catch {
      setMessage('Vlo could not make the record. Try again.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <section aria-labelledby={id} className="grid gap-2 border-t border-rule pt-4">
      <h3 id={id} className="text-sm font-semibold">
        Authorship record
      </h3>
      <p className="text-sm text-muted">
        A signed file of how you wrote this project: the minutes, and the characters that you typed, pasted,
        dictated, took from the AI and deleted. It holds no text. Anyone can check it on the{' '}
        <Link to="/verify" className="underline">
          verify page
        </Link>
        .
      </p>
      <div className="flex items-center gap-3">
        <Switch id={`${id}-stamp`} checked={stamped} onCheckedChange={setStamped} />
        <Label htmlFor={`${id}-stamp`}>Add a public timestamp</Label>
      </div>
      {stamped && (
        <p className="text-sm text-muted">
          Vlo sends one hash of the record to two free OpenTimestamps servers. The hash shows no text or
          count. Bitcoin then proves the date that the record existed.
        </p>
      )}
      <div>
        <Button type="button" variant="outline" disabled={busy} onClick={() => void download()}>
          {busy ? 'Making the record' : 'Download the record'}
        </Button>
      </div>
      <p role="status" className="text-sm text-muted empty:hidden">
        {message}
      </p>
    </section>
  );
}
