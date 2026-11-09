import { FileAudio, FileImage, FileText, FileType, Plus, StickyNote } from 'lucide-react';
import { useId, useRef, useState } from 'react';
import type { ResearchFile } from '@/lib/db';
import { Button } from '@/ui/button';
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from '@/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/ui/dropdown-menu';
import { Input } from '@/ui/input';
import { Label } from '@/ui/label';
import { Textarea } from '@/ui/textarea';
import {
  addClipping,
  addResearchFiles,
  formatSize,
  MAX_CLIP,
  MAX_RESEARCH_FILE,
  MAX_RESEARCH_NAME,
  RESEARCH_ACCEPT,
  RESEARCH_WARN,
  researchView,
  type ResearchView,
} from './research';

/*
 * The Research section at the end of the binder (roadmap F41, plan Task H6). Add files takes images, PDFs,
 * audio and text files. Add clipping takes pasted text and its link. A file opens in the research view.
 */

const ICONS: Record<ResearchView, typeof FileText> = {
  image: FileImage,
  pdf: FileType,
  audio: FileAudio,
  clip: StickyNote,
  other: FileText,
};

function ClippingForm({ projectId, onAdded }: { projectId: string; onAdded: (file: ResearchFile) => void }) {
  const id = useId();
  const [name, setName] = useState('');
  const [text, setText] = useState('');
  const [url, setUrl] = useState('');
  const [error, setError] = useState('');
  return (
    <form
      className="grid gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        addClipping(projectId, name, text, url).then(onAdded, (problem: unknown) => {
          setError(
            problem instanceof RangeError
              ? problem.message
              : 'Vlo could not save the clipping on this device.',
          );
        });
      }}
    >
      <div className="grid gap-2">
        <DialogTitle>Add a clipping</DialogTitle>
        <DialogDescription>
          Paste the text that you want to keep. Vlo keeps the link as text and never opens it.
        </DialogDescription>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor={`${id}-text`}>Text</Label>
        <Textarea
          id={`${id}-text`}
          rows={6}
          value={text}
          maxLength={MAX_CLIP}
          aria-invalid={error !== '' || undefined}
          aria-describedby={error ? `${id}-error` : undefined}
          onChange={(event) => {
            setText(event.target.value);
            setError('');
          }}
        />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor={`${id}-url`}>Link (optional)</Label>
        <Input
          id={`${id}-url`}
          value={url}
          autoComplete="off"
          onChange={(event) => {
            setUrl(event.target.value);
          }}
        />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor={`${id}-name`}>Name (optional)</Label>
        <Input
          id={`${id}-name`}
          value={name}
          maxLength={MAX_RESEARCH_NAME}
          autoComplete="off"
          onChange={(event) => {
            setName(event.target.value);
          }}
        />
      </div>
      {error && (
        <p id={`${id}-error`} role="alert" className="text-sm text-accent-text">
          {error}
        </p>
      )}
      <div className="flex flex-wrap justify-end gap-2">
        <DialogClose asChild>
          <Button type="button" variant="ghost">
            Cancel
          </Button>
        </DialogClose>
        <Button type="submit">Add clipping</Button>
      </div>
    </form>
  );
}

export function ResearchList({
  projectId,
  files,
  openId,
  onOpen,
}: {
  projectId: string;
  files: readonly ResearchFile[];
  openId: string | null;
  onOpen: (fileId: string) => void;
}) {
  const headingId = useId();
  const input = useRef<HTMLInputElement>(null);
  const [clipOpen, setClipOpen] = useState(false);
  const [message, setMessage] = useState('');

  const addFiles = (list: FileList | null) => {
    const picked = [...(list ?? [])];
    if (picked.length === 0) return;
    addResearchFiles(projectId, picked).then(
      ({ added, tooLarge, large }) => {
        const parts: string[] = [];
        if (added.length > 0) parts.push(`Added ${added.map((f) => f.name).join(', ')}.`);
        if (tooLarge.length > 0)
          parts.push(
            `${tooLarge.join(', ')} ${tooLarge.length === 1 ? 'is' : 'are'} over ${formatSize(MAX_RESEARCH_FILE)}, so Vlo did not add ${tooLarge.length === 1 ? 'it' : 'them'}.`,
          );
        if (large)
          parts.push(
            `The research of this project is over ${formatSize(RESEARCH_WARN)}. Backups take longer, and this device can run out of space.`,
          );
        setMessage(parts.join(' '));
        const first = added[0];
        if (first) onOpen(first.id);
      },
      () => {
        setMessage('Vlo could not save the files on this device. Check the storage space and try again.');
      },
    );
  };

  return (
    <section aria-labelledby={headingId} className="grid gap-2 border-t border-rule pt-3">
      <div className="flex items-center justify-between gap-2">
        <h3 id={headingId} className="text-sm font-medium text-muted">
          Research
        </h3>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" aria-label="Add research">
              <Plus aria-hidden="true" className="size-4" />
              Add
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => input.current?.click()}>Files…</DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() => {
                setClipOpen(true);
              }}
            >
              Clipping…
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <input
        ref={input}
        type="file"
        multiple
        accept={RESEARCH_ACCEPT}
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        data-testid="research-input"
        onChange={(event) => {
          addFiles(event.target.files);
          event.target.value = '';
        }}
      />
      {files.length === 0 ? (
        <p className="text-sm text-muted">Images, PDFs, audio and clippings for this project.</p>
      ) : (
        <ul aria-label="Research files" className="grid gap-0.5">
          {files.map((file) => {
            const Icon = ICONS[researchView(file)];
            return (
              <li key={file.id}>
                <button
                  type="button"
                  aria-current={file.id === openId ? 'true' : undefined}
                  onClick={() => {
                    onOpen(file.id);
                  }}
                  className="flex min-h-11 w-full items-center gap-2 rounded-md px-2 text-left text-sm hover:bg-surface focus-visible:ring-2 focus-visible:ring-accent aria-[current]:bg-surface aria-[current]:font-medium"
                >
                  <Icon aria-hidden="true" className="size-4 shrink-0 text-muted" />
                  <span className="min-w-0 flex-1 truncate">{file.name}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <p role="status" className="text-sm text-muted empty:hidden">
        {message}
      </p>
      <Dialog open={clipOpen} onOpenChange={setClipOpen}>
        {clipOpen && (
          <DialogContent>
            <ClippingForm
              projectId={projectId}
              onAdded={(file) => {
                setClipOpen(false);
                setMessage(`Added ${file.name}.`);
                onOpen(file.id);
              }}
            />
          </DialogContent>
        )}
      </Dialog>
    </section>
  );
}
