import { CalendarRange, Plus } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router';
import { useDocumentTitle } from '@/app/useDocumentTitle';
import { useMediaQuery } from '@/app/useMediaQuery';
import { addItem, nextTitle } from '@/features/binder/items';
import { flattenTree } from '@/features/binder/tree';
import { TEMPLATES } from '@/features/library/templates';
import { useProject } from '@/features/project/useProject';
import { ViewTabs } from '@/features/project/ViewTabs';
import type { Item } from '@/lib/db';
import { Button } from '@/ui/button';
import { cn } from '@/ui/cn';
import { formatDate, unitOf, type Unit } from './dates';
import { setMemory, themesOf } from './memories';
import type { MemoryActions } from './MemoryMenu';
import { ThemeColumns } from './ThemeColumns';
import { LifeStagesDialog, MemoryDialog } from './TimelineDialogs';
import { TimelineList } from './TimelineList';
import { SCALE_PRESETS, Track } from './Track';
import { useLifeStages } from './useTimeline';
import { recordFeature } from '@/features/usage/usage';
import { ProjectMissing, WrongTemplate } from '@/features/project/ViewNotices';

/*
 * The Memory Timeline screen (spec 8.2, plan Task C4): the track with its Undated shelf, the List view,
 * and By theme. They share one page, so a switch moves each memory to its new place.
 */

const THEME = 'theme';
const LIST = 'list';
const TRACK = 'track';

type Mode = 'track' | 'list' | 'theme';

/** Under 600 px the timeline opens as the List view (product owner decision, 2026-11-02). */
function modeOf(params: URLSearchParams, small: boolean): Mode {
  if (params.get('by') === THEME) return 'theme';
  const view = params.get('view');
  if (view === LIST) return 'list';
  if (view === TRACK) return 'track';
  return small ? 'list' : 'track';
}

const UNITS: { unit: Unit; label: string }[] = [
  { unit: 'year', label: 'Years' },
  { unit: 'month', label: 'Months' },
  { unit: 'day', label: 'Days' },
];

function Segmented<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div role="group" aria-label={label} className="flex rounded-md border border-rule p-0.5">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={value === option.value}
          onClick={() => {
            onChange(option.value);
          }}
          className={cn(
            'flex min-h-10 items-center rounded-[5px] px-3 text-sm font-medium',
            value === option.value ? 'bg-text text-bg' : 'text-muted hover:text-text',
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function TimelinePage() {
  const { projectId = '' } = useParams();
  useEffect(() => {
    recordFeature('timeline');
  }, []);
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const state = useProject(projectId);
  const stages = useLifeStages(projectId);
  const small = useMediaQuery('(max-width: 599px)');
  const mode = modeOf(params, small);
  const [pxPerDay, setPxPerDay] = useState(SCALE_PRESETS.year);
  const [message, setMessage] = useState('');
  const [editing, setEditing] = useState<Item | null>(null);
  const [stagesOpen, setStagesOpen] = useState(false);

  useDocumentTitle(
    state.status === 'ready'
      ? `${state.project.title}, Memory Timeline`
      : state.status === 'missing'
        ? 'Project not found'
        : 'Memory Timeline',
  );

  const items = useMemo(() => (state.status === 'ready' ? state.items : []), [state]);
  const memories = useMemo(
    () =>
      flattenTree(items)
        .map((n) => n.item)
        .filter((i) => i.kind === 'memory'),
    [items],
  );

  const onDate = useCallback((memory: Item, date: string | null) => {
    setMemory(memory.id, { date }).then(
      () => {
        setMessage(
          date === null
            ? `${memory.title} has no date now. It sits on the Undated shelf.`
            : `${memory.title} moved to ${formatDate(date)}.`,
        );
      },
      () => {
        setMessage('Vlo could not save the date on this device.');
      },
    );
  }, []);

  const actions: MemoryActions = useMemo(
    () => ({
      open: (memory) => {
        void navigate(`/p/${projectId}?${new URLSearchParams({ item: memory.id }).toString()}`);
      },
      edit: setEditing,
      clearDate: (memory) => {
        onDate(memory, null);
      },
    }),
    [navigate, onDate, projectId],
  );

  if (state.status === 'loading' || stages === undefined) return null;

  if (state.status === 'missing') {
    return <ProjectMissing />;
  }

  const { project } = state;
  const template = TEMPLATES[project.template];

  if (project.template !== 'memoir') {
    return <WrongTemplate project={project} forWhom="The Memory Timeline is for memoir projects." />;
  }

  const show = (next: Mode) => {
    if (next === 'theme') {
      setParams({ by: THEME });
      return;
    }
    const fallback = small ? 'list' : 'track';
    setParams(next === fallback ? {} : { view: next === 'list' ? LIST : TRACK });
  };

  const addMemory = async () => {
    try {
      const memory = await addItem(
        project.id,
        null,
        'memory',
        await nextTitle(project.id, 'memory', 'Memory'),
      );
      setMessage(`Added ${memory.title}. Give it a date to place it on the track.`);
      setEditing(memory);
    } catch {
      setMessage('Vlo could not add the memory on this device.');
    }
  };

  const undated = memories.filter((m) => m.memory?.date === undefined).length;
  const count = `${String(memories.length)} ${memories.length === 1 ? 'memory' : 'memories'}`;

  return (
    <section className="grid gap-4">
      <header className="min-w-0">
        <p className="text-sm text-muted">{template.label}</p>
        <h1 className="mt-1 font-display text-3xl font-semibold [overflow-wrap:anywhere] sm:text-4xl">
          {project.title}
        </h1>
        <ViewTabs project={project} />
      </header>

      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" onClick={() => void addMemory()}>
          <Plus aria-hidden="true" className="size-4" />
          Add memory
        </Button>
        <Button
          variant="outline"
          onClick={() => {
            setStagesOpen(true);
          }}
        >
          <CalendarRange aria-hidden="true" className="size-4" />
          Life stages
        </Button>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Segmented
            label="Arrange memories by"
            value={mode === 'theme' ? 'theme' : 'time'}
            options={[
              { value: 'time', label: 'By time' },
              { value: 'theme', label: 'By theme' },
            ]}
            onChange={(by) => {
              show(by === 'theme' ? 'theme' : small ? 'list' : 'track');
            }}
          />
          {mode !== 'theme' && (
            <Segmented
              label="Show the timeline as"
              value={mode}
              options={[
                { value: 'track', label: 'Track' },
                { value: 'list', label: 'List' },
              ]}
              onChange={show}
            />
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm">
          <span data-testid="memory-count">{count}</span>
          {undated > 0 && <span className="text-muted">, {undated} undated</span>}
        </p>
        {mode === 'track' && (
          <Segmented
            label="Scale"
            value={unitOf(pxPerDay)}
            options={UNITS.map((u) => ({ value: u.unit, label: u.label }))}
            onChange={(unit) => {
              setPxPerDay(SCALE_PRESETS[unit]);
            }}
          />
        )}
      </div>

      <p role="status" className={cn('min-h-5 text-sm text-muted', message === '' && 'sr-only')}>
        {message}
      </p>

      {mode === 'track' && (
        <Track
          memories={memories}
          stages={stages}
          pxPerDay={pxPerDay}
          onPxPerDay={setPxPerDay}
          actions={actions}
          onDate={onDate}
          announce={setMessage}
        />
      )}
      {mode === 'list' && <TimelineList memories={memories} stages={stages} actions={actions} />}
      {mode === 'theme' && <ThemeColumns memories={memories} actions={actions} />}

      <MemoryDialog
        memory={editing}
        stages={stages}
        themes={themesOf(memories)}
        onClose={() => {
          setEditing(null);
        }}
        onSaved={setMessage}
      />
      <LifeStagesDialog
        open={stagesOpen}
        projectId={project.id}
        stages={stages}
        onClose={() => {
          setStagesOpen(false);
        }}
        onSaved={setMessage}
      />
    </section>
  );
}
