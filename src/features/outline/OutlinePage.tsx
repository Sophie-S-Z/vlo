import { Tags } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { useMotionAllowed } from '@/app/PreferencesProvider';
import { useDocumentTitle } from '@/app/useDocumentTitle';
import { INDENT_PX, STATUS_LABEL } from '@/features/binder/BinderItem';
import { moveItem, updateItem } from '@/features/binder/items';
import { threadStroke } from '@/features/board/board';
import { formatWords } from '@/features/library/format';
import { countUnit } from '@/lib/wordcount';
import { projectDef } from '@/features/library/templates';
import { useProject } from '@/features/project/useProject';
import { ViewTabs } from '@/features/project/ViewTabs';
import { ProjectMissing } from '@/features/project/ViewNotices';
import { SequenceList, type SequenceActions } from '@/features/sequences/SequenceList';
import type { Item, Label, Status } from '@/lib/db';
import { sortByOrder } from '@/lib/order';
import { Button } from '@/ui/button';
import { cn } from '@/ui/cn';
import { LabelsDialog } from './LabelsDialog';
import { labelOf, orderForMove, outlineRows, setItemLabel } from './outline';

/*
 * The Outline view (roadmap F40, plan Task H1). Table shows every binder item with its synopsis, status,
 * label and words, and each field edits in place. Cards shows the items of one folder as index cards, in
 * binder order, and a card moves by drag, keyboard or menu.
 */

const STATUSES = Object.keys(STATUS_LABEL) as Status[];
const SAVE_FAILED = 'Vlo could not save that change on this device.';

/** A small color dot for a label. Its name always shows next to it, so color is never the only sign. */
function LabelDot({ label }: { label: Label }) {
  return (
    <span
      aria-hidden="true"
      className="inline-block size-2.5 shrink-0 rounded-full"
      style={{ background: threadStroke(label.color) }}
    />
  );
}

/**
 * A select that shows the writer's choice at once, so it never flicks back to the old value while the
 * save is on its way.
 */
function ChoiceSelect({
  value,
  label,
  options,
  onChoose,
}: {
  value: string;
  label: string;
  options: { value: string; label: string }[];
  onChoose: (value: string) => Promise<void>;
}) {
  const [chosen, setChosen] = useState<string | null>(null);
  const [stored, setStored] = useState(value);
  if (stored !== value) {
    setStored(value);
    setChosen(null);
  }
  return (
    <select
      aria-label={label}
      value={chosen ?? value}
      onChange={(event) => {
        const next = event.target.value;
        setChosen(next);
        onChoose(next).catch(() => {
          setChosen(null);
        });
      }}
      className="min-h-11 rounded-md border border-rule bg-bg px-2 text-sm"
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

/** The synopsis of one item. It saves when the field loses focus. */
function SynopsisField({ item, onError }: { item: Item; onError: () => void }) {
  const stored = item.synopsis ?? '';
  const [value, setValue] = useState(stored);
  const [shown, setShown] = useState(stored);
  // Another tab or the binder changed the synopsis: show it.
  if (shown !== stored) {
    setShown(stored);
    setValue(stored);
  }
  return (
    <textarea
      aria-label={`Synopsis of ${item.title}`}
      value={value}
      rows={2}
      onChange={(event) => {
        setValue(event.target.value);
      }}
      onBlur={() => {
        if (value.trim() === stored) return;
        updateItem(item.id, { synopsis: value.trim() }).catch(onError);
      }}
      className="w-full min-w-48 resize-y rounded-md border border-rule bg-bg px-2 py-1.5 text-sm"
    />
  );
}

export function OutlinePage() {
  const { projectId = '' } = useParams();
  const [params, setParams] = useSearchParams();
  const state = useProject(projectId);
  useDocumentTitle(state.status === 'ready' ? `Outline of ${state.project.title}` : 'Outline');
  const navigate = useNavigate();
  const motion = useMotionAllowed();
  const [message, setMessage] = useState('');
  const [labelsOpen, setLabelsOpen] = useState(false);

  const items = useMemo(() => (state.status === 'ready' ? state.items : []), [state]);
  const rows = useMemo(() => outlineRows(items), [items]);
  const def = state.status === 'ready' ? projectDef(state.project) : null;
  const folders = rows.filter((r) => def?.editorKind(r.item.kind) === null);
  const folder = folders.find((r) => r.item.id === params.get('folder'))?.item ?? null;
  const folderId = folder?.id ?? null;
  const cards = sortByOrder(items.filter((i) => i.parentId === folderId));

  // The latest cards for the card actions, so the actions object stays the same between renders.
  const latest = useRef({ cards, folder, def });
  useEffect(() => {
    latest.current = { cards, folder, def };
  });
  const actions = useMemo<SequenceActions>(
    () => ({
      move: (from, to) => {
        const { cards: list, folder: parent } = latest.current;
        const card = list[from];
        if (!card || from === to) return;
        moveItem(card.id, parent?.id ?? null, orderForMove(list, from, to)).then(
          () => {
            setMessage(`${card.title} moved. It is now ${String(to + 1)} of ${String(list.length)}.`);
          },
          () => {
            setMessage(SAVE_FAILED);
          },
        );
      },
      // A folder card shows the cards inside it. Any other card opens its text.
      open: (item) => {
        if (latest.current.def?.editorKind(item.kind) === null)
          setParams({ layout: 'cards', folder: item.id });
        else void navigate(`/p/${projectId}?${new URLSearchParams({ item: item.id }).toString()}`);
      },
    }),
    [navigate, projectId, setParams],
  );

  if (state.status === 'loading') return null;
  if (state.status === 'missing') return <ProjectMissing />;

  const { project } = state;
  const template = projectDef(project);
  const labels = project.settings.labels ?? [];
  const cardsLayout = params.get('layout') === 'cards';
  const failed = () => {
    setMessage(SAVE_FAILED);
  };
  const labelOptions = [{ value: '', label: 'None' }, ...labels.map((l) => ({ value: l.id, label: l.name }))];
  const showLayout = (cards: boolean) => {
    setParams(cards ? { layout: 'cards', ...(folder ? { folder: folder.id } : {}) } : {}, { replace: true });
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

      <div className="flex flex-wrap items-end gap-3">
        <div className="mr-auto grid gap-1">
          <h2 className="font-display text-2xl font-semibold">Outline</h2>
          <p className="text-sm text-muted">
            Every item of the binder, with its synopsis, status and label. Changes here change the binder.
          </p>
        </div>
        <div role="group" aria-label="Layout" className="flex gap-1">
          <Button
            variant={cardsLayout ? 'outline' : 'primary'}
            aria-pressed={!cardsLayout}
            onClick={() => {
              showLayout(false);
            }}
          >
            Table
          </Button>
          <Button
            variant={cardsLayout ? 'primary' : 'outline'}
            aria-pressed={cardsLayout}
            onClick={() => {
              showLayout(true);
            }}
          >
            Cards
          </Button>
        </div>
        <Button
          variant="outline"
          onClick={() => {
            setLabelsOpen(true);
          }}
        >
          <Tags aria-hidden="true" className="size-4" />
          Labels…
        </Button>
      </div>

      {rows.length === 0 ? (
        <p className="text-muted">The binder is empty. Add an item from the binder to start.</p>
      ) : cardsLayout ? (
        <div className="grid gap-4">
          <label className="flex flex-wrap items-center gap-2 text-sm">
            Cards in
            <select
              value={folder?.id ?? ''}
              onChange={(event) => {
                const id = event.target.value;
                setParams(id === '' ? { layout: 'cards' } : { layout: 'cards', folder: id }, {
                  replace: true,
                });
              }}
              className="min-h-11 rounded-md border border-rule bg-bg px-2"
            >
              <option value="">The top of the binder</option>
              {folders.map((r) => (
                <option key={r.item.id} value={r.item.id}>
                  {' '.repeat(r.depth * 2)}
                  {r.item.title}
                </option>
              ))}
            </select>
          </label>
          {cards.length === 0 ? (
            <p className="text-muted">This folder is empty.</p>
          ) : (
            <SequenceList
              name={folder?.title ?? 'the top of the binder'}
              poems={cards}
              motion={motion}
              actions={actions}
              noun="card"
              details={(item) => {
                const label = labelOf(labels, item);
                return (
                  <>
                    <p className="mt-1 text-sm [overflow-wrap:anywhere]">
                      {item.synopsis ?? <span className="text-muted">No synopsis.</span>}
                    </p>
                    <p className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted">
                      {template.kindLabel[item.kind] ?? item.kind}, {STATUS_LABEL[item.status].toLowerCase()},{' '}
                      {formatWords(
                        rows.find((r) => r.item.id === item.id)?.words ?? 0,
                        countUnit(project.settings.language),
                      )}
                      {label && (
                        <>
                          , <LabelDot label={label} />
                          {label.name}
                        </>
                      )}
                    </p>
                  </>
                );
              }}
            />
          )}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <caption className="sr-only">Outline of {project.title}</caption>
            <thead>
              <tr className="border-b border-rule text-left text-muted">
                {[
                  'Title',
                  'Kind',
                  'Synopsis',
                  'Status',
                  'Label',
                  countUnit(project.settings.language) === 'words' ? 'Words' : 'Characters',
                ].map((name) => (
                  <th key={name} scope="col" className="px-2 pb-2 font-medium">
                    {name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map(({ item, depth, words }) => {
                const label = labelOf(labels, item);
                return (
                  <tr key={item.id} className="border-b border-rule align-top">
                    <th
                      scope="row"
                      className="px-2 py-2 text-left font-medium [overflow-wrap:anywhere]"
                      style={{ paddingLeft: `${String(8 + depth * INDENT_PX)}px` }}
                    >
                      {template.editorKind(item.kind) === null ? (
                        <span className="inline-flex min-h-11 items-center">{item.title}</span>
                      ) : (
                        <Link
                          to={`/p/${project.id}?${new URLSearchParams({ item: item.id }).toString()}`}
                          className="inline-flex min-h-11 items-center"
                        >
                          {item.title}
                        </Link>
                      )}
                    </th>
                    <td className="px-2 py-2 whitespace-nowrap text-muted">
                      <span className="inline-flex min-h-11 items-center">
                        {template.kindLabel[item.kind] ?? item.kind}
                      </span>
                    </td>
                    <td className="px-2 py-2">
                      <SynopsisField item={item} onError={failed} />
                    </td>
                    <td className="px-2 py-2">
                      <ChoiceSelect
                        value={item.status}
                        label={`Status of ${item.title}`}
                        options={STATUSES.map((s) => ({ value: s, label: STATUS_LABEL[s] }))}
                        onChoose={(status) =>
                          updateItem(item.id, { status: status as Status }).catch((problem: unknown) => {
                            failed();
                            throw problem;
                          })
                        }
                      />
                    </td>
                    <td className="px-2 py-2">
                      <span className="inline-flex items-center gap-2">
                        {label && <LabelDot label={label} />}
                        <ChoiceSelect
                          value={label?.id ?? ''}
                          label={`Label of ${item.title}`}
                          options={labelOptions}
                          onChoose={(id) =>
                            setItemLabel(item.id, id === '' ? null : id).catch((problem: unknown) => {
                              failed();
                              throw problem;
                            })
                          }
                        />
                      </span>
                    </td>
                    <td className="px-2 py-2 text-right font-mono whitespace-nowrap">
                      <span className="inline-flex min-h-11 items-center">{words.toLocaleString()}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <p role="status" className={cn('text-sm text-muted', message === '' && 'sr-only')}>
        {message}
      </p>
      <LabelsDialog
        project={labelsOpen ? project : null}
        onClose={() => {
          setLabelsOpen(false);
        }}
        onSaved={setMessage}
      />
    </section>
  );
}
