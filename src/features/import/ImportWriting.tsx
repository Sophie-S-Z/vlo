import { FileInput } from 'lucide-react';
import { useId, useRef, useState, type RefObject } from 'react';
import { useNavigate } from 'react-router';
import { TemplatePicker, useTemplatePick } from '@/features/library/TemplatePicker';
import { importTextKind, projectDef } from '@/features/library/templates';
import { clock } from '@/lib/clock';
import { countWords } from '@/lib/wordcount';
import { Button } from '@/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from '@/ui/dialog';
import { Input } from '@/ui/input';
import { Label } from '@/ui/label';
import type { PickedFile } from './read';
import type { ImportNode, ImportSource } from './tree';

/*
 * "Import writing" in the Library (roadmap F34). The writer picks files, a zip or a folder, checks the
 * summary, picks the templates and imports with one press. The readers load on the first pick.
 */

/** Larger files would not fit in the memory of most phones. */
const MAX_BYTES = 1024 * 1024 * 1024;

const READ_FAILED = 'Vlo could not read these files. Pick them again.';

function summary(nodes: readonly ImportNode[]): { texts: number; words: number; indented: boolean } {
  let texts = 0;
  let words = 0;
  let indented = false;
  const walk = (list: readonly ImportNode[]) => {
    for (const node of list) {
      if (node.text) {
        texts += 1;
        words += countWords(node.text.poem);
        indented ||= /^[ \t]+\S/m.test(node.text.poem);
      }
      walk(node.children ?? []);
    }
  };
  walk(nodes);
  return { texts, words, indented };
}

export function ImportWriting() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [source, setSource] = useState<ImportSource | null>(null);
  // null keeps the title that the files give.
  const [title, setTitle] = useState<string | null>(null);
  const { pick, toggle, reset } = useTemplatePick();
  const files = useRef<HTMLInputElement>(null);
  const folder = useRef<HTMLInputElement>(null);
  const titleId = useId();
  const shownTitle = title ?? source?.title ?? '';

  function changeOpen(next: boolean) {
    setOpen(next);
    if (!next) {
      setSource(null);
      setTitle(null);
      setError(null);
      reset();
    }
  }

  async function read(list: FileList) {
    const picked = Array.from(list);
    if (picked.reduce((sum, f) => sum + f.size, 0) > MAX_BYTES) {
      setError('These files are larger than 1 GB. Vlo cannot import them on this device.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const [{ readPicked }, { ImportError }] = await Promise.all([import('./read'), import('./tree')]);
      try {
        const out = await readPicked(
          picked.map((f): PickedFile => ({
            path: f.webkitRelativePath || f.name,
            read: async () => new Uint8Array(await f.arrayBuffer()),
          })),
        );
        setSource(out);
        setTitle(null);
      } catch (e) {
        setError(e instanceof ImportError ? e.message : READ_FAILED);
      }
    } catch {
      setError(READ_FAILED);
    }
    setBusy(false);
  }

  async function store(from: ImportSource) {
    if (shownTitle.trim() === '') {
      setError('A project needs a title.');
      return;
    }
    setBusy(true);
    try {
      const [{ toBackup }, { importBackup }] = await Promise.all([
        import('./tree'),
        import('@/features/backup/backup'),
      ]);
      let backup;
      try {
        backup = toBackup({ ...from, title: shownTitle }, pick.value, clock.now());
      } catch {
        setError(READ_FAILED);
        setBusy(false);
        return;
      }
      const id = await importBackup(backup, 'same');
      void navigate(`/p/${id}`);
    } catch {
      setError('Vlo could not save the project on this device. Check that the browser allows site data.');
      setBusy(false);
    }
  }

  const fileInput = (ref: RefObject<HTMLInputElement | null>, isFolder: boolean) => (
    <input
      ref={(element) => {
        ref.current = element;
        // React has no prop for a folder pick. Every current browser reads this attribute.
        if (isFolder) element?.setAttribute('webkitdirectory', '');
      }}
      type="file"
      multiple
      {...(isFolder ? {} : { accept: '.docx,.md,.markdown,.txt,.zip' })}
      className="sr-only"
      tabIndex={-1}
      aria-hidden="true"
      onChange={(event) => {
        const list = event.target.files;
        if (list && list.length > 0) void read(list);
        // The same files can be picked again after an error.
        event.target.value = '';
      }}
    />
  );

  const counts = source ? summary(source.nodes) : null;
  // Only the poem editor keeps the spaces and tabs at the start of a line.
  const def = projectDef(pick.value);
  const losesIndents = counts?.indented === true && def.editorKind(importTextKind(pick.value)) !== 'poem';
  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="ghost">
          <FileInput aria-hidden="true" className="size-4" />
          Import writing
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogTitle>Import writing</DialogTitle>
        <DialogDescription>
          Vlo reads Word (.docx), Markdown, plain text and Scrivener projects. Pick files, a zip, or a folder
          such as a .scriv folder. In a Word or Markdown file, each Heading 1 starts a folder and each Heading
          2 starts an item.
        </DialogDescription>
        {fileInput(files, false)}
        {fileInput(folder, true)}

        {source === null || counts === null ? (
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" disabled={busy} onClick={() => files.current?.click()}>
              {busy ? 'Reading…' : 'Choose files'}
            </Button>
            <Button type="button" variant="outline" disabled={busy} onClick={() => folder.current?.click()}>
              Choose a folder
            </Button>
            <DialogClose asChild>
              <Button type="button" variant="ghost">
                Cancel
              </Button>
            </DialogClose>
          </div>
        ) : (
          <form
            className="grid gap-6"
            onSubmit={(event) => {
              event.preventDefault();
              void store(source);
            }}
          >
            <div role="status" className="grid gap-1 text-sm">
              <p>
                Vlo found {counts.texts === 1 ? '1 text' : `${counts.texts.toLocaleString()} texts`} with{' '}
                {counts.words === 1 ? '1 word' : `${counts.words.toLocaleString()} words`}.
              </p>
              {source.skipped.length > 0 && (
                <p className="text-muted">Vlo leaves out: {source.skipped.join(', ')}.</p>
              )}
              {losesIndents && (
                <p className="text-muted">
                  Some lines start with spaces or tabs. To keep these indents, pick Poetry collection.
                </p>
              )}
            </div>
            <div className="grid gap-2">
              <Label htmlFor={titleId}>Title</Label>
              <Input
                id={titleId}
                value={shownTitle}
                onChange={(event) => {
                  setTitle(event.target.value);
                  setError(null);
                }}
                autoComplete="off"
              />
            </div>
            <TemplatePicker pick={pick} onToggle={toggle} label="What do you write?" />
            <div className="flex flex-wrap justify-end gap-2">
              <DialogClose asChild>
                <Button type="button" variant="ghost">
                  Cancel
                </Button>
              </DialogClose>
              <Button type="submit" disabled={busy}>
                Import
              </Button>
            </div>
          </form>
        )}
        {error !== null && (
          <p role="alert" className="text-sm text-accent-text">
            {error}
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}
