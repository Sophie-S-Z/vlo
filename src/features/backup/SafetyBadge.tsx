import { useLiveQuery } from 'dexie-react-hooks';
import { ShieldAlert, ShieldCheck, ShieldQuestion } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { clock } from '@/lib/clock';
import { db, type Project } from '@/lib/db';
import { Button } from '@/ui/button';
import { cn } from '@/ui/cn';
import { Popover, PopoverContent, PopoverTrigger } from '@/ui/popover';
import { BackupDialog } from './BackupDialog';
import type { FolderStatus } from './folderAccess';
import { FOLDER_STATUS_KEY } from './folderKeys';
import { currentSafariDevice } from './safari';
import { safetyState, type SafetyLevel, type SafetyReason } from './safety';

/* The safety badge in the site header (roadmap F31). */

const LOOK: Record<SafetyLevel, { word: string; Icon: typeof ShieldCheck; summary: string }> = {
  safe: { word: 'Safe', Icon: ShieldCheck, summary: 'Each project has a backup from the last 7 days.' },
  check: { word: 'Check', Icon: ShieldQuestion, summary: 'Your work is on this device. Check these points:' },
  risk: {
    word: 'At risk',
    Icon: ShieldAlert,
    summary: 'This browser can delete your work. Check these points:',
  },
};

interface ReasonProps {
  reason: SafetyReason;
  /** Closes the popover, because a link or a button in it starts the next step. */
  onLeave: () => void;
  onBackUp: (project: Project) => void;
}

function Reason({ reason, onLeave, onBackUp }: ReasonProps) {
  if (reason.kind === 'safari')
    return (
      <>
        Safari can clear Vlo data after 7 days without a visit.{' '}
        <Link to="/settings" className="underline" onClick={onLeave}>
          See the install steps
        </Link>
      </>
    );
  if (reason.kind === 'folder')
    return (
      <>
        The last folder save of “{reason.title}” failed.{' '}
        <Link to="/settings" className="underline" onClick={onLeave}>
          Open Settings
        </Link>
      </>
    );
  return (
    <span className="flex flex-wrap items-center justify-between gap-2">
      <span className="[overflow-wrap:anywhere]">
        “{reason.project.title}” has no backup from the last 7 days.
      </span>
      <Button
        type="button"
        variant="outline"
        aria-label={`Back up ${reason.project.title}`}
        onClick={() => {
          onLeave();
          onBackUp(reason.project);
        }}
      >
        Back up
      </Button>
    </span>
  );
}

export function SafetyBadge() {
  const [safari] = useState(() => currentSafariDevice() !== null);
  const [open, setOpen] = useState(false);
  const [backingUp, setBackingUp] = useState<Project | null>(null);
  const state = useLiveQuery(async () => {
    try {
      const [projects, folder] = await Promise.all([
        db.projects.toArray(),
        db.appMeta.get(FOLDER_STATUS_KEY),
      ]);
      if (projects.length === 0) return null;
      return safetyState({
        projects,
        safari,
        folder: (folder?.value as FolderStatus | undefined) ?? null,
        now: clock.now(),
      });
    } catch {
      return null;
    }
  });
  // No badge with nothing to keep safe, while storage loads, or when the browser blocks it.
  if (!state) return null;
  const { level, reasons } = state;
  const { word, Icon, summary } = LOOK[level];

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            className={cn('px-3', level === 'safe' ? 'text-muted' : 'text-text')}
          >
            <Icon aria-hidden="true" className="size-4" />
            <span className="sr-only">Safety: </span>
            {word}
          </Button>
        </PopoverTrigger>
        <PopoverContent aria-label="Safety of your work" className="grid gap-3 text-sm">
          <p>{summary}</p>
          {reasons.length > 0 && (
            <ul className="grid gap-2">
              {reasons.map((reason) => (
                <li key={reason.kind === 'backup' ? reason.project.id : reason.kind}>
                  <Reason
                    reason={reason}
                    onLeave={() => {
                      setOpen(false);
                    }}
                    onBackUp={setBackingUp}
                  />
                </li>
              ))}
            </ul>
          )}
        </PopoverContent>
      </Popover>
      <BackupDialog
        project={backingUp}
        onClose={() => {
          setBackingUp(null);
        }}
      />
    </>
  );
}
