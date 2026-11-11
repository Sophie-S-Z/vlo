import { useEffect, useId, useRef, useState } from 'react';
import { hasTemplate } from '@/features/library/templates';
import { updateProjectSettings } from '@/features/library/projects';
import { NameCheckLists } from '@/features/people/NameCheckLists';
import { privatePeople } from '@/features/people/people';
import { sourcesFor } from '@/features/cite/sources';
import { saveFile } from '@/features/export/startExport';
import type { ExportFile } from '@/features/export/run';
import { MAX_PACKET_TEXT, type Item, type Project } from '@/lib/db';
import type { NameCheck } from '@/lib/privacy';
import { Button } from '@/ui/button';
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from '@/ui/dialog';
import { Input } from '@/ui/input';
import { Label } from '@/ui/label';
import { RadioGroup, RadioGroupItem } from '@/ui/radio-group';
import { Switch } from '@/ui/switch';
import { Textarea } from '@/ui/textarea';
import { startingSynopsis, startPacket, type PacketFormat, type PacketJob } from './packet';
import { addSubmission, MAX_VENUE, todayIso } from './submissions';

/*
 * "Make a packet" (roadmap F53, plan Task J3): the writer picks the pieces and writes a cover letter, a bio
 * and a synopsis. Vlo saves one zip and logs a "Sent" row for today. The letter and the bio stay with the
 * project for the next packet.
 */

type Step =
  | { step: 'choose'; error?: string }
  | { step: 'working' }
  | { step: 'names'; names: NameCheck; job: PacketJob }
  | { step: 'done'; file: ExportFile; venue: string };

interface PacketDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  project: Project;
  items: readonly Item[];
  /** The pieces the writer can choose, in binder order. */
  pieces: readonly Item[];
  venues: readonly string[];
  /** Runs after the row is logged, with the venue, so the page can announce it. */
  onLogged: (venue: string) => void;
}

export function PacketDialog({
  open,
  onOpenChange,
  project,
  items,
  pieces,
  venues,
  onLogged,
}: PacketDialogProps) {
  const id = useId();
  const [venue, setVenue] = useState('');
  const [chosen, setChosen] = useState<string[]>([]);
  const [format, setFormat] = useState<PacketFormat>('docx');
  const [letter, setLetter] = useState(project.settings.packet?.letter ?? '');
  const [bio, setBio] = useState(project.settings.packet?.bio ?? '');
  // The synopsis follows the chosen pieces until the writer types in it.
  const [synopsis, setSynopsis] = useState<string | null>(null);
  const [safe, setSafe] = useState(hasTemplate(project, 'memoir'));
  const [status, setStatus] = useState<Step>({ step: 'choose' });
  const jobRef = useRef<PacketJob | null>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);
  const shownSynopsis = synopsis ?? startingSynopsis(items, chosen);

  const closeJob = () => {
    jobRef.current?.close();
    jobRef.current = null;
  };
  useEffect(() => closeJob, []);

  const fail = (error: string) => {
    setStatus({ step: 'choose', error });
    requestAnimationFrame(() => errorRef.current?.focus());
  };

  async function finish(job: PacketJob, name: string) {
    setStatus({ step: 'working' });
    try {
      const file = await job.make(name);
      saveFile(file);
      await addSubmission(project.id, { itemIds: chosen, venue: name, sentAt: todayIso(), status: 'sent' });
      onLogged(name);
      setStatus({ step: 'done', file, venue: name });
    } catch {
      fail('Vlo could not make the packet. Check the storage space on this device and try again.');
    } finally {
      if (jobRef.current === job) closeJob();
    }
  }

  async function makePacket() {
    const name = venue.trim().replace(/\s+/g, ' ');
    if (chosen.length === 0 || name === '') {
      fail(chosen.length === 0 ? 'Choose at least one piece.' : 'Type the venue.');
      return;
    }
    setStatus({ step: 'working' });
    closeJob();
    try {
      // The letter and the bio stay with the project, so the next packet starts with them.
      await updateProjectSettings(project.id, { packet: { letter, bio } });
      const job = await startPacket({
        project,
        items,
        pieceIds: chosen,
        format,
        letter,
        bio,
        synopsis: shownSynopsis,
        // A failed read of the people fails the packet, so a share-safe file never goes without aliases.
        people: await privatePeople(project.id),
        sources: await sourcesFor(project.id),
        shareSafe: safe,
      });
      jobRef.current = job;
      if (safe && (job.names.unmarked.length > 0 || job.names.changed.length > 0)) {
        setStatus({ step: 'names', names: job.names, job });
        return;
      }
      await finish(job, name);
    } catch {
      closeJob();
      fail('Vlo could not make the packet. Check the storage space on this device and try again.');
    }
  }

  const changeOpen = (next: boolean) => {
    if (!next && status.step === 'working') return;
    onOpenChange(next);
    if (!next) {
      closeJob();
      setStatus({ step: 'choose' });
    }
  };

  const textField = (
    key: string,
    label: string,
    hint: string,
    value: string,
    onChange: (next: string) => void,
  ) => (
    <div className="grid gap-1.5">
      <Label htmlFor={`${id}-${key}`}>{label}</Label>
      <Textarea
        id={`${id}-${key}`}
        value={value}
        rows={4}
        maxLength={MAX_PACKET_TEXT}
        aria-describedby={`${id}-${key}-hint`}
        onChange={(event) => {
          onChange(event.target.value);
        }}
      />
      <p id={`${id}-${key}-hint`} className="text-sm text-muted">
        {hint}
      </p>
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogContent className="max-w-xl" aria-busy={status.step === 'working'}>
        {status.step === 'done' ? (
          <>
            <DialogTitle>Your packet is ready</DialogTitle>
            <DialogDescription>
              Vlo saved <span className="font-medium text-text">{status.file.name}</span> to your downloads
              and logged it as sent to {status.venue} today.
            </DialogDescription>
            {status.file.notices.length > 0 && (
              <ul className="grid list-disc gap-1 pl-5 text-sm text-muted">
                {status.file.notices.map((notice) => (
                  <li key={notice}>{notice}</li>
                ))}
              </ul>
            )}
            <div className="flex justify-end">
              <DialogClose asChild>
                <Button type="button">Done</Button>
              </DialogClose>
            </div>
          </>
        ) : status.step === 'names' ? (
          <>
            <DialogTitle>Check the private names</DialogTitle>
            <DialogDescription>
              The packet puts an alias in place of each real name below. Nothing with a real name leaves this
              device.
            </DialogDescription>
            <NameCheckLists names={status.names} marked={null} what="export" />
            <div className="flex flex-wrap justify-end gap-2">
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  closeJob();
                  setStatus({ step: 'choose' });
                }}
              >
                Back
              </Button>
              <Button
                type="button"
                onClick={() => {
                  void finish(status.job, venue.trim().replace(/\s+/g, ' '));
                }}
              >
                Make it with aliases
              </Button>
            </div>
          </>
        ) : (
          <>
            <DialogTitle>Make a packet</DialogTitle>
            <DialogDescription>
              One zip with your pieces and the texts below. Vlo logs it as sent today.
            </DialogDescription>
            <form
              noValidate
              className="grid gap-5"
              onSubmit={(event) => {
                event.preventDefault();
                void makePacket();
              }}
            >
              <div className="grid gap-1.5">
                <Label htmlFor={`${id}-venue`}>Venue</Label>
                <Input
                  id={`${id}-venue`}
                  value={venue}
                  maxLength={MAX_VENUE}
                  list={`${id}-venues`}
                  autoComplete="off"
                  onChange={(event) => {
                    setVenue(event.target.value);
                  }}
                />
                <datalist id={`${id}-venues`}>
                  {venues.map((v) => (
                    <option key={v} value={v} />
                  ))}
                </datalist>
              </div>

              <fieldset className="grid gap-2">
                <legend className="mb-2 text-sm font-medium">Pieces</legend>
                <ul className="grid max-h-56 gap-0.5 overflow-y-auto rounded-[var(--radius-card)] border border-rule bg-bg p-1 sm:grid-cols-2">
                  {pieces.map((piece) => {
                    const on = chosen.includes(piece.id);
                    return (
                      <li key={piece.id}>
                        <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-md px-2 hover:bg-surface">
                          <input
                            type="checkbox"
                            checked={on}
                            onChange={() => {
                              setChosen((now) =>
                                on ? now.filter((c) => c !== piece.id) : [...now, piece.id],
                              );
                            }}
                            className="size-4 shrink-0 accent-[var(--accent)]"
                          />
                          <span className="min-w-0 [overflow-wrap:anywhere]">{piece.title}</span>
                        </label>
                      </li>
                    );
                  })}
                </ul>
              </fieldset>

              <fieldset className="grid gap-2">
                <legend className="mb-2 text-sm font-medium">File format</legend>
                <RadioGroup
                  aria-label="File format"
                  value={format}
                  onValueChange={(next) => {
                    setFormat(next as PacketFormat);
                  }}
                  className="flex flex-wrap gap-x-6"
                >
                  <div className="flex min-h-11 items-center gap-3 text-sm">
                    <RadioGroupItem id={`${id}-docx`} value="docx" />
                    <label htmlFor={`${id}-docx`}>Word</label>
                  </div>
                  <div className="flex min-h-11 items-center gap-3 text-sm">
                    <RadioGroupItem id={`${id}-pdf`} value="pdf" />
                    <label htmlFor={`${id}-pdf`}>PDF</label>
                  </div>
                </RadioGroup>
              </fieldset>

              {textField(
                'letter',
                'Cover letter',
                'Vlo keeps it for your next packet. Leave it empty for no letter.',
                letter,
                setLetter,
              )}
              {textField('bio', 'Bio', 'Vlo keeps it for your next packet too.', bio, setBio)}
              {textField(
                'synopsis',
                'Synopsis',
                'It starts with the synopsis of each piece you chose.',
                shownSynopsis,
                setSynopsis,
              )}

              <div className="grid gap-1">
                <div className="flex items-center gap-3">
                  <Switch
                    id={`${id}-safe`}
                    checked={safe}
                    onCheckedChange={setSafe}
                    aria-describedby={`${id}-safe-hint`}
                  />
                  <label htmlFor={`${id}-safe`} className="text-sm font-medium">
                    Share-safe packet
                  </label>
                </div>
                <p id={`${id}-safe-hint`} className="pl-14 text-sm text-muted">
                  Swaps each real name for its alias in every file of the packet.
                </p>
              </div>

              {status.step === 'choose' && status.error && (
                <p ref={errorRef} tabIndex={-1} role="alert" className="text-sm text-accent-text">
                  {status.error}
                </p>
              )}

              <div className="flex flex-wrap justify-end gap-2">
                <DialogClose asChild>
                  <Button type="button" variant="ghost" disabled={status.step === 'working'}>
                    Cancel
                  </Button>
                </DialogClose>
                <Button type="submit" disabled={status.step === 'working'}>
                  {status.step === 'working' ? 'Making the packet' : 'Save the packet'}
                </Button>
              </div>
              <p aria-live="polite" className="sr-only">
                {status.step === 'working' ? 'Making the packet.' : ''}
              </p>
            </form>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
