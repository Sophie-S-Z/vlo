import { useLiveQuery } from 'dexie-react-hooks';
import { useId, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { useDocumentTitle } from '@/app/useDocumentTitle';
import { db } from '@/lib/db';
import { Button } from '@/ui/button';
import { Input } from '@/ui/input';
import { Label } from '@/ui/label';
import { Textarea } from '@/ui/textarea';
import { captureNote, INBOX, sharedText } from './capture';

/*
 * The quick note screen (roadmap F48, plan Task H8). The share sheet and the app shortcut open it with
 * `?title=&text=&url=`, and the Library has a Quick note button. A failed save keeps the text here.
 */

const NEW_PROJECT = '';

export function CapturePage() {
  useDocumentTitle('Quick note');
  const id = useId();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const projects = useLiveQuery(() => db.projects.orderBy('updatedAt').reverse().toArray(), []);
  const [title, setTitle] = useState(() => params.get('title') ?? '');
  const [text, setText] = useState(() => sharedText(params.get('text') ?? '', params.get('url') ?? ''));
  // The project that the writer picks. Until then, the project with the latest change.
  const [picked, setPicked] = useState<string | null>(null);
  const projectId = picked ?? projects?.[0]?.id ?? NEW_PROJECT;
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  return (
    <section className="mx-auto grid max-w-2xl gap-6">
      <div className="grid gap-2">
        <h1 className="font-display text-4xl font-semibold">Quick note</h1>
        <p className="text-muted">
          The note goes into the {INBOX} folder at the top of the project. It stays on this device.
        </p>
      </div>
      <form
        className="grid gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          setBusy(true);
          captureNote(projectId === NEW_PROJECT ? null : projectId, { title, text }).then(
            (note) => {
              void navigate(`/p/${note.projectId}?item=${note.itemId}`);
            },
            (problem: unknown) => {
              setBusy(false);
              setError(
                problem instanceof RangeError
                  ? problem.message
                  : 'Vlo could not save the note on this device. Check the storage space and try again.',
              );
            },
          );
        }}
      >
        <div className="grid gap-1.5">
          <Label htmlFor={`${id}-project`}>Project</Label>
          <select
            id={`${id}-project`}
            value={projectId}
            disabled={projects === undefined}
            onChange={(event) => {
              setPicked(event.target.value);
            }}
            className="min-h-11 rounded-md border border-rule bg-bg px-2 text-sm text-text pointer-fine:min-h-9"
          >
            {projects?.map((project) => (
              <option key={project.id} value={project.id}>
                {project.title}
              </option>
            ))}
            <option value={NEW_PROJECT}>A new Open writing project</option>
          </select>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor={`${id}-title`}>Title (optional)</Label>
          <Input
            id={`${id}-title`}
            value={title}
            autoComplete="off"
            onChange={(event) => {
              setTitle(event.target.value);
            }}
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor={`${id}-text`}>Text</Label>
          <Textarea
            id={`${id}-text`}
            rows={8}
            value={text}
            aria-invalid={error !== '' || undefined}
            aria-describedby={error ? `${id}-error` : undefined}
            onChange={(event) => {
              setText(event.target.value);
              setError('');
            }}
          />
        </div>
        {error && (
          <p id={`${id}-error`} role="alert" className="text-sm text-accent-text">
            {error}
          </p>
        )}
        <div className="flex justify-end">
          <Button type="submit" disabled={busy || projects === undefined}>
            Save note
          </Button>
        </div>
      </form>
    </section>
  );
}
