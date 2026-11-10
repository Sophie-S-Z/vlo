import { useId, useState } from 'react';
import { Link } from 'react-router';
import { exportFileName } from '@/features/export/build';
import type { Project } from '@/lib/db';
import { downloadBytes } from '@/lib/download';
import { Button } from '@/ui/button';
import { exportRecord } from './record';

/** The authorship record in the Export dialog (F54, plan Task K5). It works in every AI mode. */
export function RecordDownload({ project }: { project: Project }) {
  const id = useId();
  const [message, setMessage] = useState('');
  const download = async () => {
    try {
      const record = await exportRecord(project.id);
      if (record === null) {
        setMessage('This project has no record yet. Vlo starts it when you write.');
        return;
      }
      const name = `${exportFileName(project.title)} authorship record.json`;
      downloadBytes(name, 'application/json', new TextEncoder().encode(record));
      setMessage('');
    } catch {
      setMessage('Vlo could not make the record. Try again.');
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
      <div>
        <Button type="button" variant="outline" onClick={() => void download()}>
          Download the record
        </Button>
      </div>
      <p role="status" className="text-sm text-muted empty:hidden">
        {message}
      </p>
    </section>
  );
}
