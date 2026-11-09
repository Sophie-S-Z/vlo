import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { Link } from 'react-router';
import { db, type Project } from '@/lib/db';
import { Button } from '@/ui/button';
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from '@/ui/dialog';
import { changeTemplates } from './projects';
import { TemplatePicker, togglePick, type TemplatePick } from './TemplatePicker';
import { misfits, projectDef } from './templates';

/*
 * Change templates later (roadmap F35, decision P3). Adding a template only adds kinds and views. A template
 * can go only when every item fits the others, so the dialog lists the items to move or delete first.
 */

interface TemplatesDialogProps {
  project: Project | null;
  onClose: () => void;
}

export function TemplatesDialog({ project, onClose }: TemplatesDialogProps) {
  return (
    <Dialog
      open={project !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      {project !== null && (
        <DialogContent className="max-w-2xl">
          <DialogTitle className="[overflow-wrap:anywhere]">Templates of {project.title}</DialogTitle>
          <DialogDescription>
            Each template adds its kinds of items and its views. When you remove a template, its view data
            stays, and it shows again if you add the template back.
          </DialogDescription>
          <TemplatesForm key={project.id} project={project} onDone={onClose} />
        </DialogContent>
      )}
    </Dialog>
  );
}

function TemplatesForm({ project, onDone }: { project: Project; onDone: () => void }) {
  const [pick, setPick] = useState<TemplatePick>({ value: project.templates, suggested: false });
  const [error, setError] = useState<string | null>(null);
  const items = useLiveQuery(() => db.items.where('projectId').equals(project.id).toArray(), [project.id]);
  const blocking = items ? misfits(items, pick.value) : [];
  const def = projectDef(project);

  async function submit() {
    try {
      // The check runs again in the save, so an item added in another tab cannot slip through.
      if ((await changeTemplates(project.id, pick.value)).length === 0) onDone();
    } catch {
      setError('Vlo could not save the change on this device.');
    }
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
      className="grid gap-6"
    >
      <TemplatePicker
        pick={pick}
        onToggle={(template) => {
          setPick((prev) => togglePick(prev, template));
          setError(null);
        }}
        label="Templates"
      />
      {blocking.length > 0 && (
        <div role="status" className="grid gap-2 text-sm">
          <p>
            {blocking.length === 1 ? 'This item does' : 'These items do'} not fit the templates you picked.
            Move or delete {blocking.length === 1 ? 'it' : 'them'} first:
          </p>
          <ul className="grid list-disc gap-1 pl-5">
            {blocking.map((item) => (
              <li key={item.id} className="[overflow-wrap:anywhere]">
                <Link to={`/p/${project.id}?item=${item.id}`}>{item.title}</Link>{' '}
                <span className="text-muted">({def.kindLabel[item.kind] ?? item.kind})</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {error !== null && (
        <p role="alert" className="text-sm text-accent-text">
          {error}
        </p>
      )}
      <div className="flex flex-wrap justify-end gap-2">
        <DialogClose asChild>
          <Button type="button" variant="ghost">
            Cancel
          </Button>
        </DialogClose>
        <Button type="submit" disabled={items === undefined || blocking.length > 0}>
          Save
        </Button>
      </div>
    </form>
  );
}
