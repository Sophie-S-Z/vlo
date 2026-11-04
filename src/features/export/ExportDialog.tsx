import { FileText, FileType } from 'lucide-react';
import { RadioGroup as RadioGroupPrimitive } from 'radix-ui';
import { useId, useState, type ReactNode } from 'react';
import { TEMPLATES } from '@/features/library/templates';
import type { Item, Project } from '@/lib/db';
import type { Alias } from '@/lib/privacy';
import { Button } from '@/ui/button';
import { cn } from '@/ui/cn';
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from '@/ui/dialog';
import { RadioGroup, RadioGroupItem } from '@/ui/radio-group';
import { Switch } from '@/ui/switch';
import { folderOf, type ExportScope } from './build';
import type { ExportFormat } from './notices';
import type { ExportFile } from './run';
import { saveFile, startExport } from './startExport';

/*
 * The export dialog (plan Task B2): the format, what the file holds, and the share-safe switch. After the
 * file is saved, the dialog lists what the format changes and, for Word, the two steps to Google Docs.
 */

const FORMATS: { id: ExportFormat; label: string; detail: string; icon: typeof FileText }[] = [
  {
    id: 'docx',
    label: 'Word',
    detail: 'A .docx file. It opens in Word, Google Docs, Pages and LibreOffice.',
    icon: FileType,
  },
  {
    id: 'markdown',
    label: 'Markdown',
    detail: 'A .md text file with its marks. It opens in any notes app.',
    icon: FileText,
  },
];

type ScopeChoice = 'item' | 'folder' | 'project';

type Status =
  | { step: 'choose' }
  | { step: 'working' }
  | { step: 'done'; file: ExportFile; format: ExportFormat }
  | { step: 'failed' };

interface ExportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  project: Project;
  items: readonly Item[];
  /** The item open in the editor, for the "this item" and "this chapter" choices. */
  currentItemId: string | null;
  /** The project's private names and their aliases. */
  aliases: readonly Alias[];
}

function lower(label: string): string {
  return label.charAt(0).toLowerCase() + label.slice(1);
}

function OptionCard({ value, children }: { value: string; children: ReactNode }) {
  return (
    <RadioGroupPrimitive.Item
      value={value}
      className={cn(
        'flex items-start gap-3 rounded-[var(--radius-card)] border border-rule bg-bg p-3 text-left outline-none',
        'focus-visible:ring-2 focus-visible:ring-accent data-[state=checked]:border-accent data-[state=checked]:shadow-[inset_0_0_0_1px_var(--accent)]',
      )}
    >
      {children}
    </RadioGroupPrimitive.Item>
  );
}

export function ExportDialog({
  open,
  onOpenChange,
  project,
  items,
  currentItemId,
  aliases,
}: ExportDialogProps) {
  const ids = useId();
  const template = TEMPLATES[project.template];
  const current = items.find((i) => i.id === currentItemId && template.editorKind(i.kind) !== null) ?? null;
  const folder = current ? folderOf(items, current.id) : null;
  const [format, setFormat] = useState<ExportFormat>('docx');
  const [scope, setScope] = useState<ScopeChoice>(current ? 'item' : 'project');
  const [safe, setSafe] = useState(project.template === 'memoir');
  const [status, setStatus] = useState<Status>({ step: 'choose' });

  const changeOpen = (next: boolean) => {
    if (!next && status.step === 'working') return;
    onOpenChange(next);
    if (!next) setStatus({ step: 'choose' });
  };

  const scopeOf = (choice: ScopeChoice): ExportScope =>
    choice === 'item' && current
      ? { kind: 'item', itemId: current.id }
      : choice === 'folder' && folder
        ? { kind: 'folder', itemId: folder.id }
        : { kind: 'project' };

  async function exportNow() {
    setStatus({ step: 'working' });
    try {
      const file = await startExport({
        project,
        items: [...items],
        scope: scopeOf(scope),
        format,
        aliases: [...aliases],
        shareSafe: safe,
      });
      saveFile(file);
      setStatus({ step: 'done', file, format });
    } catch {
      setStatus({ step: 'failed' });
    }
  }

  const kindLabel = (item: Item) => lower(template.kindLabel[item.kind] ?? item.kind);

  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogContent className="max-w-xl" aria-busy={status.step === 'working'}>
        {status.step === 'done' ? (
          <>
            <DialogTitle>Your file is ready</DialogTitle>
            <DialogDescription>
              Vlo saved <span className="font-medium text-text">{status.file.name}</span> to your downloads.
            </DialogDescription>
            {status.file.notices.length > 0 && (
              <section aria-labelledby={`${ids}-notices`} className="grid gap-2">
                <h3 id={`${ids}-notices`} className="text-sm font-semibold">
                  What changes in this format
                </h3>
                <ul className="grid list-disc gap-1 pl-5 text-sm text-muted">
                  {status.file.notices.map((notice) => (
                    <li key={notice}>{notice}</li>
                  ))}
                </ul>
              </section>
            )}
            {status.format === 'docx' && (
              <section
                aria-labelledby={`${ids}-docs`}
                className="grid gap-2 rounded-[var(--radius-card)] bg-bg p-4"
              >
                <h3 id={`${ids}-docs`} className="text-sm font-semibold">
                  Open it in Google Docs
                </h3>
                <ol className="grid list-decimal gap-1 pl-5 text-sm">
                  <li>
                    In{' '}
                    <a href="https://drive.google.com/" target="_blank" rel="noreferrer noopener">
                      Google Drive
                    </a>
                    , choose New, then File upload, and pick {status.file.name}.
                  </li>
                  <li>Open the file, then choose File, then Save as Google Docs.</li>
                </ol>
                <p className="text-xs text-muted">
                  Nothing leaves this device until you upload the file yourself.
                </p>
              </section>
            )}
            <div className="flex flex-wrap justify-end gap-2">
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  saveFile(status.file);
                }}
              >
                Download again
              </Button>
              <DialogClose asChild>
                <Button type="button">Done</Button>
              </DialogClose>
            </div>
          </>
        ) : (
          <>
            <DialogTitle>Export</DialogTitle>
            <DialogDescription>Make a file of your writing to share, print or keep.</DialogDescription>
            <form
              className="grid gap-6"
              onSubmit={(event) => {
                event.preventDefault();
                void exportNow();
              }}
            >
              <fieldset className="grid gap-2">
                <legend className="mb-2 text-sm font-semibold">Format</legend>
                <RadioGroupPrimitive.Root
                  aria-label="Format"
                  value={format}
                  onValueChange={(next) => {
                    setFormat(next as ExportFormat);
                  }}
                  className="grid gap-2 sm:grid-cols-2"
                >
                  {FORMATS.map((f) => (
                    <OptionCard key={f.id} value={f.id}>
                      <f.icon aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-accent-text" />
                      <span className="grid gap-1">
                        <span className="font-medium">{f.label}</span>
                        <span className="text-sm text-muted">{f.detail}</span>
                      </span>
                    </OptionCard>
                  ))}
                </RadioGroupPrimitive.Root>
              </fieldset>

              <fieldset className="grid gap-2">
                <legend className="mb-2 text-sm font-semibold">What to export</legend>
                <RadioGroup
                  aria-label="What to export"
                  value={scope}
                  onValueChange={(next) => {
                    setScope(next as ScopeChoice);
                  }}
                >
                  {current && (
                    <label className="flex min-h-11 items-center gap-3 text-sm">
                      <RadioGroupItem value="item" />
                      <span className="[overflow-wrap:anywhere]">
                        This {kindLabel(current)}: {current.title}
                      </span>
                    </label>
                  )}
                  {folder && (
                    <label className="flex min-h-11 items-center gap-3 text-sm">
                      <RadioGroupItem value="folder" />
                      <span className="[overflow-wrap:anywhere]">
                        This {kindLabel(folder)}: {folder.title}
                      </span>
                    </label>
                  )}
                  <label className="flex min-h-11 items-center gap-3 text-sm">
                    <RadioGroupItem value="project" />
                    <span className="[overflow-wrap:anywhere]">The whole project: {project.title}</span>
                  </label>
                </RadioGroup>
              </fieldset>

              <div className="grid gap-1">
                <div className="flex items-center gap-3">
                  <Switch
                    id={`${ids}-safe`}
                    checked={safe}
                    onCheckedChange={setSafe}
                    aria-describedby={`${ids}-safe-hint`}
                  />
                  <label htmlFor={`${ids}-safe`} className="text-sm font-medium">
                    Share-safe export
                  </label>
                </div>
                <p id={`${ids}-safe-hint`} className="pl-14 text-sm text-muted">
                  {aliases.length > 0
                    ? `Swaps each private name for its alias: ${String(aliases.length)} ${aliases.length === 1 ? 'name' : 'names'}.`
                    : 'Swaps each private name for its alias. This project has no private names yet.'}
                </p>
              </div>

              {status.step === 'failed' && (
                <p role="alert" className="text-sm text-accent-text">
                  Vlo could not make the file. Check the storage space on this device and try again.
                </p>
              )}

              <div className="flex flex-wrap justify-end gap-2">
                <DialogClose asChild>
                  <Button type="button" variant="ghost" disabled={status.step === 'working'}>
                    Cancel
                  </Button>
                </DialogClose>
                <Button type="submit" disabled={status.step === 'working'}>
                  {status.step === 'working' ? 'Making the file' : 'Export'}
                </Button>
              </div>
              <p aria-live="polite" className="sr-only">
                {status.step === 'working' ? 'Making the file.' : ''}
              </p>
            </form>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
