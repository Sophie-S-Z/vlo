import { Trash2, UserPlus, Wand2, X } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import { Link, useParams } from 'react-router';
import { useDocumentTitle } from '@/app/useDocumentTitle';
import { TEMPLATES } from '@/features/library/templates';
import { useProject } from '@/features/project/useProject';
import { ViewTabs } from '@/features/project/ViewTabs';
import type { Person } from '@/lib/db';
import type { NameVariant } from '@/lib/privacy';
import { Button } from '@/ui/button';
import { cn } from '@/ui/cn';
import { Input } from '@/ui/input';
import { Label } from '@/ui/label';
import { markAllInProject, scanProject, type NameScan } from './markAll';
import {
  addPerson,
  deletePerson,
  MAX_LABEL,
  MAX_NAME,
  restorePerson,
  updatePerson,
  usePeople,
} from './people';

/*
 * People and private names (spec 8.2, plan Task C5). The writer adds each real person with the ways the
 * text names them and an alias for each. "Mark all" marks every exact match in the project.
 */

function problemText(problem: unknown, fallback: string): string {
  return problem instanceof RangeError ? problem.message : fallback;
}

function plural(n: number, one: string, many: string): string {
  return `${String(n)} ${n === 1 ? one : many}`;
}

/** How many matches of one real name have no mark. */
function countText(scan: NameScan | null, real: string): string {
  if (!scan) return '';
  const unmarked = scan.unmarked.get(real) ?? 0;
  return unmarked === 0 ? 'All marked' : `${plural(unmarked, 'match', 'matches')} with no mark`;
}

function AddPersonForm({ projectId, onAdded }: { projectId: string; onAdded: (person: Person) => void }) {
  const id = useId();
  const [real, setReal] = useState('');
  const [alias, setAlias] = useState('');
  const [error, setError] = useState('');
  const realRef = useRef<HTMLInputElement>(null);
  return (
    <form
      aria-labelledby={`${id}-title`}
      className="grid gap-3 rounded-[var(--radius-card)] border border-rule bg-surface p-4"
      onSubmit={(event) => {
        event.preventDefault();
        addPerson(projectId, '', [{ real, alias }]).then(
          (person) => {
            setReal('');
            setAlias('');
            setError('');
            onAdded(person);
            realRef.current?.focus();
          },
          (problem: unknown) => {
            setError(problemText(problem, 'Vlo could not save the person on this device.'));
          },
        );
      }}
    >
      <h2 id={`${id}-title`} className="text-base font-semibold">
        Add a person
      </h2>
      <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <div className="grid gap-1.5">
          <Label htmlFor={`${id}-real`}>Real name</Label>
          <Input
            ref={realRef}
            id={`${id}-real`}
            value={real}
            maxLength={MAX_NAME}
            autoComplete="off"
            onChange={(event) => {
              setReal(event.target.value);
              setError('');
            }}
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor={`${id}-alias`}>Alias</Label>
          <Input
            id={`${id}-alias`}
            value={alias}
            maxLength={MAX_NAME}
            autoComplete="off"
            aria-invalid={error !== '' || undefined}
            aria-describedby={error ? `${id}-error` : `${id}-hint`}
            onChange={(event) => {
              setAlias(event.target.value);
              setError('');
            }}
          />
        </div>
        <Button type="submit">
          <UserPlus aria-hidden="true" className="size-4" />
          Add person
        </Button>
      </div>
      {error ? (
        <p id={`${id}-error`} role="alert" className="text-sm text-accent-text">
          {error}
        </p>
      ) : (
        <p id={`${id}-hint`} className="text-sm text-muted">
          Add the full name first, such as Aunt Rosa. Add a short form, such as Rosa, to the person after.
        </p>
      )}
    </form>
  );
}

function PersonSection({
  person,
  scan,
  onDelete,
}: {
  person: Person;
  scan: NameScan | null;
  onDelete: (person: Person) => void;
}) {
  const id = useId();
  const [error, setError] = useState('');
  const [newReal, setNewReal] = useState('');
  const [newAlias, setNewAlias] = useState('');
  const newRef = useRef<HTMLInputElement>(null);
  const marked = scan?.marked.get(person.id) ?? 0;

  const save = (patch: { label?: string; variants?: readonly NameVariant[] }) =>
    updatePerson(person.id, patch).then(
      () => {
        setError('');
        return true;
      },
      (problem: unknown) => {
        setError(problemText(problem, 'Vlo could not save the change on this device.'));
        return false;
      },
    );

  const changeVariant = (index: number, field: keyof NameVariant, value: string) => {
    const current = person.variants[index];
    if (!current || current[field] === value.trim()) return;
    void save({ variants: person.variants.map((v, i) => (i === index ? { ...v, [field]: value } : v)) });
  };

  return (
    <section aria-labelledby={`${id}-name`} className="grid gap-3 border-t border-rule pt-5">
      <div className="flex flex-wrap items-start gap-3">
        <div className="grid min-w-0 flex-1 gap-1">
          <h2 id={`${id}-name`} className="font-display text-2xl font-semibold [overflow-wrap:anywhere]">
            {person.label}
          </h2>
          <p className="text-sm text-muted">
            {marked === 0
              ? 'No marked names in the text yet'
              : `${plural(marked, 'marked name', 'marked names')} in the text`}
          </p>
        </div>
        <Button
          variant="ghost"
          aria-label={`Delete ${person.label}`}
          onClick={() => {
            onDelete(person);
          }}
        >
          <Trash2 aria-hidden="true" className="size-4" />
          <span className="max-sm:sr-only">Delete</span>
        </Button>
      </div>

      <div className="grid max-w-md gap-1.5">
        <Label htmlFor={`${id}-label`}>
          Label<span className="sr-only"> of {person.label}</span>
        </Label>
        <Input
          id={`${id}-label`}
          defaultValue={person.label}
          key={person.label}
          maxLength={MAX_LABEL}
          onBlur={(event) => {
            if (event.target.value.trim() !== person.label) void save({ label: event.target.value });
          }}
        />
      </div>

      <table className="w-full max-w-3xl border-collapse text-sm">
        <caption className="sr-only">Names of {person.label} and their aliases</caption>
        <thead className="max-sm:sr-only">
          <tr className="text-left text-muted">
            <th scope="col" className="pb-1 font-medium">
              Real name
            </th>
            <th scope="col" className="pb-1 font-medium">
              Alias
            </th>
            <th scope="col" className="pb-1 font-medium">
              In the text
            </th>
            <th scope="col" className="pb-1">
              <span className="sr-only">Remove</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {person.variants.map((variant, index) => (
            <tr
              key={`${variant.real}-${String(index)}`}
              className="grid grid-cols-[1fr_auto] gap-x-2 gap-y-1 py-2 sm:table-row"
            >
              <td className="sm:py-1 sm:pr-2">
                <Input
                  aria-label={`Real name ${String(index + 1)} of ${person.label}`}
                  defaultValue={variant.real}
                  maxLength={MAX_NAME}
                  onBlur={(event) => {
                    changeVariant(index, 'real', event.target.value);
                  }}
                />
              </td>
              <td className="col-start-1 sm:py-1 sm:pr-2">
                <Input
                  aria-label={`Alias for ${variant.real}`}
                  defaultValue={variant.alias}
                  maxLength={MAX_NAME}
                  onBlur={(event) => {
                    changeVariant(index, 'alias', event.target.value);
                  }}
                />
              </td>
              <td className="col-start-1 text-muted sm:py-1 sm:pr-2">{countText(scan, variant.real)}</td>
              <td className="col-start-2 row-span-3 row-start-1 self-start sm:py-1">
                <Button
                  variant="ghost"
                  className="min-w-11 px-0"
                  aria-label={`Remove the name ${variant.real}`}
                  disabled={person.variants.length === 1}
                  onClick={() => {
                    void save({ variants: person.variants.filter((_, i) => i !== index) });
                  }}
                >
                  <X aria-hidden="true" className="size-4" />
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <form
        aria-label={`Add a name for ${person.label}`}
        className="grid max-w-3xl gap-2 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
        onSubmit={(event) => {
          event.preventDefault();
          void save({ variants: [...person.variants, { real: newReal, alias: newAlias }] }).then((ok) => {
            if (!ok) return;
            setNewReal('');
            setNewAlias('');
            newRef.current?.focus();
          });
        }}
      >
        <div className="grid gap-1.5">
          <Label htmlFor={`${id}-new-real`}>
            Another real name<span className="sr-only"> for {person.label}</span>
          </Label>
          <Input
            ref={newRef}
            id={`${id}-new-real`}
            value={newReal}
            maxLength={MAX_NAME}
            autoComplete="off"
            onChange={(event) => {
              setNewReal(event.target.value);
            }}
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor={`${id}-new-alias`}>
            Its alias<span className="sr-only"> for {person.label}</span>
          </Label>
          <Input
            id={`${id}-new-alias`}
            value={newAlias}
            maxLength={MAX_NAME}
            autoComplete="off"
            onChange={(event) => {
              setNewAlias(event.target.value);
            }}
          />
        </div>
        <Button type="submit" variant="outline">
          Add name
        </Button>
      </form>
      {error && (
        <p role="alert" className="text-sm text-accent-text">
          {error}
        </p>
      )}
    </section>
  );
}

export function PeoplePage() {
  const { projectId = '' } = useParams();
  const state = useProject(projectId);
  const people = usePeople(projectId);
  const [scan, setScan] = useState<NameScan | null>(null);
  const [message, setMessage] = useState('');
  const [deleted, setDeleted] = useState<Person | null>(null);
  const [marking, setMarking] = useState(false);
  const undoRef = useRef<HTMLButtonElement>(null);

  useDocumentTitle(
    state.status === 'ready'
      ? `${state.project.title}, People`
      : state.status === 'missing'
        ? 'Project not found'
        : 'People',
  );

  // The counts read every item's text, so they run again only when the people change or after Mark all.
  const [scanAt, setScanAt] = useState(0);
  useEffect(() => {
    if (!people) return;
    let live = true;
    scanProject(projectId, people).then(
      (next) => {
        if (live) setScan(next);
      },
      () => {
        if (live) setScan(null);
      },
    );
    return () => {
      live = false;
    };
  }, [projectId, people, scanAt]);

  useEffect(() => {
    if (deleted) undoRef.current?.focus();
  }, [deleted]);

  if (state.status === 'loading' || people === undefined) return null;

  if (state.status === 'missing') {
    return (
      <section>
        <h1 className="font-display text-4xl font-semibold">Project not found</h1>
        <p className="mt-4 text-muted">
          This device has no project at this address. It may have been deleted.
        </p>
        <p className="mt-6">
          <Link to="/">Go to the Library</Link>
        </p>
      </section>
    );
  }

  const { project } = state;
  const template = TEMPLATES[project.template];

  if (project.template !== 'memoir') {
    return (
      <section>
        <h1 className="font-display text-4xl font-semibold [overflow-wrap:anywhere]">{project.title}</h1>
        <p className="mt-4 max-w-prose text-muted">
          People and private names are for memoir projects. This project is a {template.label.toLowerCase()}.
        </p>
        <p className="mt-6">
          <Link to={`/p/${project.id}`}>Go back to the writing</Link>
        </p>
      </section>
    );
  }

  const announce = (text: string) => {
    setDeleted(null);
    setMessage(text);
  };

  const unmarked = scan ? [...scan.unmarked.values()].reduce((a, b) => a + b, 0) : 0;

  const markAll = async () => {
    setMarking(true);
    try {
      const { names, items } = await markAllInProject(project.id, people);
      announce(
        names === 0
          ? 'Every real name in the text has a mark.'
          : `Marked ${plural(names, 'name', 'names')} in ${plural(items, 'item', 'items')}.`,
      );
      setScanAt((n) => n + 1);
    } catch {
      announce('Vlo could not mark the names on this device.');
    } finally {
      setMarking(false);
    }
  };

  return (
    <section className="grid gap-6">
      <header className="min-w-0">
        <p className="text-sm text-muted">{template.label}</p>
        <h1 className="mt-1 font-display text-3xl font-semibold [overflow-wrap:anywhere] sm:text-4xl">
          {project.title}
        </h1>
        <ViewTabs project={project} />
      </header>

      <div className="grid max-w-prose gap-2">
        <p>
          Give each real person an alias. A share-safe export shows the alias, and the text on this device
          keeps the real name.
        </p>
        <p className="text-sm text-muted">
          Select a name in the text and choose Mark as person, or mark every match here at once.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button variant="outline" disabled={people.length === 0 || marking} onClick={() => void markAll()}>
          <Wand2 aria-hidden="true" className="size-4" />
          {marking ? 'Marking names' : 'Mark all names'}
        </Button>
        {scan && people.length > 0 && (
          <p className="text-sm text-muted" data-testid="unmarked-count">
            {unmarked === 0
              ? 'Every real name in the text has a mark.'
              : `${plural(unmarked, 'real name', 'real names')} in the text with no mark.`}
          </p>
        )}
      </div>

      <div className={cn('flex min-h-11 flex-wrap items-center gap-3 text-sm', message === '' && 'sr-only')}>
        <p role="status" className="text-muted">
          {message}
        </p>
        {deleted && (
          <Button
            ref={undoRef}
            variant="outline"
            onClick={() => {
              const person = deleted;
              restorePerson(person).then(
                () => {
                  announce(`Restored ${person.label}.`);
                },
                () => {
                  announce('Vlo could not restore the person on this device.');
                },
              );
            }}
          >
            Undo
          </Button>
        )}
      </div>

      <AddPersonForm
        projectId={project.id}
        onAdded={(person) => {
          announce(`Added ${person.label}.`);
        }}
      />

      {people.length === 0 ? (
        <p className="text-muted">No people yet. Add the first person above.</p>
      ) : (
        <div className="grid gap-6">
          {people.map((person) => (
            <PersonSection
              key={person.id}
              person={person}
              scan={scan}
              onDelete={(target) => {
                deletePerson(target.id).then(
                  (row) => {
                    if (!row) return;
                    setMessage(`Deleted ${row.label}. Undo brings the person back with each mark.`);
                    setDeleted(row);
                  },
                  () => {
                    announce('Vlo could not delete the person on this device.');
                  },
                );
              }}
            />
          ))}
        </div>
      )}
    </section>
  );
}
