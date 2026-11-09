import { useState } from 'react';
import { clock } from '@/lib/clock';
import { db } from '@/lib/db';
import { downloadBytes } from '@/lib/download';
import { Button } from '@/ui/button';

/* "Download all my writing" in Settings (roadmap F33). The export code loads on the first press. */

export function WalkawayExport() {
  const [state, setState] = useState<{ busy: boolean; message: string }>({ busy: false, message: '' });

  async function download() {
    setState({ busy: true, message: 'Making the zip.' });
    try {
      const [{ collectBackup }, { walkawayZip }] = await Promise.all([
        import('./backup'),
        import('@/features/export/walkaway'),
      ]);
      const projects = (await db.projects.toArray()).sort((a, b) => a.title.localeCompare(b.title));
      const backups = [];
      for (const { id } of projects) backups.push(await collectBackup(id, { music: false }));
      const day = new Date(clock.now()).toISOString().slice(0, 10);
      const name = `My writing ${day}.zip`;
      downloadBytes(name, 'application/zip', await walkawayZip(backups));
      setState({ busy: false, message: `Vlo saved ${name} to your downloads.` });
    } catch {
      setState({ busy: false, message: 'Vlo could not make the zip. Reload Vlo and try again.' });
    }
  }

  return (
    <div className="mt-6 grid gap-3">
      <h3 className="font-semibold">All my writing</h3>
      <p className="text-sm text-muted">
        One zip with a folder for each project: a Markdown file for each item, in binder order, and an
        index.html page that opens in any browser. You can read it without Vlo.
      </p>
      <div>
        <Button type="button" variant="outline" disabled={state.busy} onClick={() => void download()}>
          {state.busy ? 'Making the zip…' : 'Download all my writing'}
        </Button>
      </div>
      <p role="status" className={state.busy ? 'sr-only' : 'text-sm text-muted'}>
        {state.message}
      </p>
    </div>
  );
}
