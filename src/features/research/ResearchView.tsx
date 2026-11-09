import { Trash2 } from 'lucide-react';
import { useCallback, useId, useState } from 'react';
import type { ResearchFile } from '@/lib/db';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
} from '@/ui/alert-dialog';
import { downloadBytes } from '@/lib/download';
import { Button } from '@/ui/button';
import { Input } from '@/ui/input';
import { Label } from '@/ui/label';
import { deleteResearch, formatSize, MAX_RESEARCH_NAME, renameResearch, researchView } from './research';

/*
 * The research view (roadmap F41, plan Task H6). An image, a PDF or an audio file shows from a blob: URL,
 * so it never leaves the device. A clipping shows its text, and its link stays text.
 */

/**
 * A ref that gives the element a blob: URL of the file in `src` while it is on the page. The URL goes
 * when the element goes.
 */
function useBlobSource(blob: Blob | undefined) {
  return useCallback(
    (element: HTMLElement | null) => {
      if (!element || !blob) return;
      const url = URL.createObjectURL(blob);
      element.setAttribute('src', url);
      return () => {
        URL.revokeObjectURL(url);
      };
    },
    [blob],
  );
}

const KIND_LABEL = { image: 'Image', pdf: 'PDF', audio: 'Audio', clip: 'Clipping', other: 'File' } as const;

export function ResearchView({ file, onDeleted }: { file: ResearchFile; onDeleted: () => void }) {
  const id = useId();
  const view = researchView(file);
  const source = useBlobSource(file.data);
  const [error, setError] = useState('');
  const [confirm, setConfirm] = useState(false);

  return (
    <article aria-labelledby={`${id}-title`} className="mx-auto grid max-w-3xl gap-4">
      <header className="grid gap-3">
        <div className="flex flex-wrap items-start gap-3">
          <div className="grid min-w-0 flex-1 gap-1">
            <h2 id={`${id}-title`} className="font-display text-2xl font-semibold [overflow-wrap:anywhere]">
              {file.name}
            </h2>
            <p className="text-sm text-muted">
              {KIND_LABEL[view]}
              {file.data ? `, ${formatSize(file.size)}` : ''}. Research stays on this device, and exports
              leave it out.
            </p>
          </div>
          <Button
            variant="ghost"
            aria-label={`Delete ${file.name}`}
            onClick={() => {
              setConfirm(true);
            }}
          >
            <Trash2 aria-hidden="true" className="size-4" />
            <span className="max-sm:sr-only">Delete</span>
          </Button>
        </div>
        <div className="grid max-w-md gap-1.5">
          <Label htmlFor={`${id}-name`}>Name</Label>
          <Input
            id={`${id}-name`}
            key={file.name}
            defaultValue={file.name}
            maxLength={MAX_RESEARCH_NAME}
            onBlur={(event) => {
              const input = event.target;
              if (input.value.trim() === file.name) return;
              renameResearch(file.id, input.value).then(
                () => {
                  setError('');
                },
                (problem: unknown) => {
                  setError(problem instanceof RangeError ? problem.message : 'Vlo could not save the name.');
                  input.value = file.name;
                },
              );
            }}
          />
          {error && (
            <p role="alert" className="text-sm text-accent-text">
              {error}
            </p>
          )}
        </div>
      </header>

      {view === 'clip' && file.clip && (
        <div className="grid gap-3">
          <p className="font-manuscript [overflow-wrap:anywhere] whitespace-pre-wrap">{file.clip.text}</p>
          {file.clip.url && (
            <p className="text-sm text-muted [overflow-wrap:anywhere]">
              Link: <span className="font-mono select-all">{file.clip.url}</span>
            </p>
          )}
        </div>
      )}
      {file.data && view === 'image' && (
        <img ref={source} alt={file.name} className="max-h-[80vh] w-auto max-w-full" />
      )}
      {file.data && view === 'pdf' && (
        <iframe ref={source} title={file.name} className="h-[80vh] w-full rounded-md border border-rule" />
      )}
      {file.data && view === 'audio' && (
        // A research recording has no captions to offer; the writer added it.
        // eslint-disable-next-line jsx-a11y/media-has-caption
        <audio ref={source} controls className="w-full" aria-label={file.name} />
      )}
      {/* A browser that cannot show the file in the page can still open the download. */}
      {file.data && (
        <p>
          <Button
            variant="outline"
            onClick={() => {
              const blob = file.data;
              if (blob)
                void blob.arrayBuffer().then((bytes) => {
                  downloadBytes(file.name, file.type, new Uint8Array(bytes));
                });
            }}
          >
            Download {file.name}
          </Button>
        </p>
      )}

      <AlertDialog open={confirm} onOpenChange={setConfirm}>
        <AlertDialogContent>
          <AlertDialogTitle className="[overflow-wrap:anywhere]">Delete {file.name}?</AlertDialogTitle>
          <AlertDialogDescription>This removes it from this device.</AlertDialogDescription>
          <div className="flex flex-wrap justify-end gap-2">
            <AlertDialogCancel asChild>
              <Button variant="ghost">Cancel</Button>
            </AlertDialogCancel>
            <Button
              onClick={() => {
                deleteResearch(file.id).then(
                  () => {
                    setConfirm(false);
                    onDeleted();
                  },
                  () => {
                    setConfirm(false);
                    setError('Vlo could not delete the file. Reload Vlo and try again.');
                  },
                );
              }}
            >
              Delete file
            </Button>
          </div>
        </AlertDialogContent>
      </AlertDialog>
    </article>
  );
}
