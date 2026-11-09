import { useId, useRef, useState } from 'react';
import { getTracking } from '@/features/editor/trackingStore';
import { bookmarkName } from '@/features/export/model';
import { projectDef } from '@/features/library/templates';
import type { Item, Project } from '@/lib/db';
import { Button } from '@/ui/button';
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from '@/ui/dialog';
import { placeReview, unplacedAll, type Placement } from './placeReview';
import { readReview } from './review';
import { ImportError } from './tree';

/*
 * "Import an editor's changes" (F45, decision R3). The writer picks the Word file that an editor changed.
 * Vlo puts each tracked change and comment on its words in the project, as waiting changes, and then
 * lists what it placed and each change that it could not place.
 */

type Status =
  { step: 'choose'; error?: string } | { step: 'working' } | { step: 'done'; placement: Placement };

const FOREIGN =
  'This file has no Vlo marks. Use Import writing in the Library to make a new project from it.';
const FAILED = 'Vlo could not read this file or save the changes. Pick the file again.';

const REASONS = {
  changed: 'You changed this text after the export.',
  missing: 'This item is not in the project now.',
} as const;

const plural = (n: number, one: string) => `${n.toLocaleString()} ${one}${n === 1 ? '' : 's'}`;

export interface ReviewImportProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  project: Project;
  items: readonly Item[];
}

export function ReviewImport({ open, onOpenChange, project, items }: ReviewImportProps) {
  const headingId = useId();
  const [status, setStatus] = useState<Status>({ step: 'choose' });
  const input = useRef<HTMLInputElement>(null);
  const template = projectDef(project);

  async function read(file: File) {
    setStatus({ step: 'working' });
    try {
      const review = await readReview(new Uint8Array(await file.arrayBuffer()));
      if (review.foreign) {
        setStatus({ step: 'choose', error: FOREIGN });
        return;
      }
      const total: Placement = { changes: 0, comments: 0, unplaced: [] };
      const pass = getTracking().pass;
      for (const [name, paragraphs] of review.sections) {
        const item = items.find((i) => bookmarkName(i.id) === name);
        const form = item ? template.editorKind(item.kind) : null;
        const placement =
          item && form
            ? await placeReview(
                {
                  item,
                  form,
                  pass,
                  ...(project.settings.language ? { language: project.settings.language } : {}),
                },
                paragraphs,
              )
            : { changes: 0, comments: 0, unplaced: unplacedAll(paragraphs) };
        total.changes += placement.changes;
        total.comments += placement.comments;
        total.unplaced.push(...placement.unplaced);
      }
      setStatus({ step: 'done', placement: total });
    } catch (error) {
      setStatus({ step: 'choose', error: error instanceof ImportError ? error.message : FAILED });
    }
  }

  const changeOpen = (next: boolean) => {
    if (!next && status.step === 'working') return;
    onOpenChange(next);
    if (!next) setStatus({ step: 'choose' });
  };

  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogContent className="max-w-xl">
        <DialogTitle>Import an editor’s changes</DialogTitle>
        <DialogDescription>
          Pick the Word file that your editor sent back. Vlo puts each tracked change and comment on its
          words, and you accept or reject each change under the text. Vlo saves a snapshot of each item first.
        </DialogDescription>
        <input
          ref={input}
          type="file"
          accept=".docx"
          className="sr-only"
          tabIndex={-1}
          aria-hidden="true"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void read(file);
            // The same file can be picked again after an error.
            event.target.value = '';
          }}
        />
        {status.step === 'done' ? (
          <div className="grid gap-4">
            <p role="status" className="text-sm">
              Vlo placed {plural(status.placement.changes, 'change')} and{' '}
              {plural(status.placement.comments, 'comment')}.
            </p>
            {status.placement.unplaced.length > 0 && (
              <section aria-labelledby={headingId} className="grid gap-2">
                <h3 id={headingId} className="text-sm font-semibold">
                  Changes that Vlo could not place
                </h3>
                <ul className="grid gap-2 text-sm">
                  {status.placement.unplaced.map((change, index) => (
                    <li key={index}>
                      <span className="block [overflow-wrap:anywhere]">“{change.quote}”</span>
                      <span className="text-muted">{REASONS[change.reason]}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}
            <div className="flex justify-end">
              <DialogClose asChild>
                <Button type="button">Done</Button>
              </DialogClose>
            </div>
          </div>
        ) : (
          <div className="grid gap-3">
            {status.step === 'choose' && status.error && (
              <p role="alert" className="text-sm text-accent-text">
                {status.error}
              </p>
            )}
            <div className="flex flex-wrap justify-end gap-2">
              <DialogClose asChild>
                <Button type="button" variant="ghost" disabled={status.step === 'working'}>
                  Cancel
                </Button>
              </DialogClose>
              <Button
                type="button"
                disabled={status.step === 'working'}
                onClick={() => input.current?.click()}
              >
                {status.step === 'working' ? 'Placing the changes' : 'Choose a Word file'}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
