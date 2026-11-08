import { Layers, Plus, Rows3, Sparkles } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router';
import { useMotionAllowed } from '@/app/PreferencesProvider';
import { useDocumentTitle } from '@/app/useDocumentTitle';
import { useMediaQuery } from '@/app/useMediaQuery';
import { flattenTree } from '@/features/binder/tree';
import { TEMPLATES } from '@/features/library/templates';
import { useProject } from '@/features/project/useProject';
import { GRID_VIEW, ViewTabs } from '@/features/project/ViewTabs';
import type { Card } from '@/lib/db';
import { Button } from '@/ui/button';
import { cn } from '@/ui/cn';
import { cardsFromScenes, deleteCard, restoreCard, type DeletedCard } from './board';
import { CardDialog, LinkDialog, ThreadsDialog, type CardFormTarget } from './BoardDialogs';
import { BoardList } from './BoardList';
import { Canvas } from './Canvas';
import type { CardActions } from './CardMenu';
import { CARD_HEIGHT, CARD_WIDTH, GRID, snap, toBoard, type Size, type View } from './geometry';
import { PlotGridView } from './PlotGridView';
import { FROM_CARD, useBoard } from './useBoard';
import { recordFeature } from '@/features/usage/usage';
import { ProjectMissing, WrongTemplate } from '@/features/project/ViewNotices';

/*
 * The Story Board screen (spec 8.1, plan Tasks C2 and C3): the canvas, its List view and the Plot Grid.
 * The three share one page, so a switch keeps the canvas view and each card moves to its new place.
 */

/** The search values that show the List view and the canvas. */
const LIST_VIEW = 'list';
const CANVAS_VIEW = 'canvas';

type Mode = 'board' | 'list' | 'grid';

/** Under 600 px the board opens as the List view (product owner decision, 2026-11-02). */
function modeOf(value: string | null, small: boolean): Mode {
  if (value === GRID_VIEW) return 'grid';
  if (value === LIST_VIEW) return 'list';
  if (value === CANVAS_VIEW) return 'board';
  return small ? 'list' : 'board';
}

export function BoardPage() {
  const { projectId = '' } = useParams();
  useEffect(() => {
    recordFeature('board');
  }, []);
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const state = useProject(projectId);
  const rows = useBoard(projectId);
  const motion = useMotionAllowed();
  const small = useMediaQuery('(max-width: 599px)');
  const mode = modeOf(params.get('view'), small);

  const [view, setView] = useState<View | null>(null);
  const size = useRef<Size | null>(null);
  const [message, setMessage] = useState('');
  const [deleted, setDeleted] = useState<DeletedCard | null>(null);
  const [cardForm, setCardForm] = useState<CardFormTarget | null>(null);
  const [linking, setLinking] = useState<Card | null>(null);
  const [threadsOpen, setThreadsOpen] = useState(false);
  const undoRef = useRef<HTMLButtonElement>(null);

  useDocumentTitle(
    state.status === 'ready'
      ? `${state.project.title}, ${mode === 'grid' ? 'Plot Grid' : 'Story Board'}`
      : state.status === 'missing'
        ? 'Project not found'
        : 'Story Board',
  );

  // The Undo button takes focus after a delete, so a keyboard user does not lose their place.
  useEffect(() => {
    if (deleted) undoRef.current?.focus();
  }, [deleted]);

  const announce = useCallback((text: string) => {
    setDeleted(null);
    setMessage(text);
  }, []);

  const onSize = useCallback((next: Size) => {
    size.current = next;
  }, []);

  const items = useMemo(() => (state.status === 'ready' ? state.items : []), [state]);
  const inBinderOrder = useMemo(() => flattenTree(items).map((n) => n.item), [items]);
  const itemTitles = useMemo(() => new Map(items.map((i) => [i.id, i.title])), [items]);

  const actions: CardActions = useMemo(
    () => ({
      edit: (card) => {
        setCardForm({ type: 'edit', card });
      },
      links: (card) => {
        setLinking(card);
      },
      open: (card) => {
        if (card.itemId === undefined) return;
        const search = new URLSearchParams({ item: card.itemId, [FROM_CARD]: card.id });
        void navigate(`/p/${projectId}?${search.toString()}`);
      },
      remove: (card) => {
        deleteCard(card.id).then(
          (removed) => {
            if (!removed) return;
            setMessage(`Deleted the card ${card.title}.`);
            setDeleted(removed);
          },
          () => {
            announce('Vlo could not delete the card on this device.');
          },
        );
      },
    }),
    [announce, navigate, projectId],
  );

  if (state.status === 'loading' || rows === undefined) return null;

  if (state.status === 'missing') {
    return <ProjectMissing />;
  }

  const { project } = state;
  const template = TEMPLATES[project.template];

  if (project.template !== 'novel') {
    return <WrongTemplate project={project} forWhom="The Story Board is for novel projects." />;
  }

  const scenes = inBinderOrder.filter((i) => i.kind === 'scene');
  const cardItems = inBinderOrder.filter((i) => i.kind === 'scene' || i.kind === 'note');

  const showMode = (next: 'board' | 'list') => {
    // Each screen size opens as its own default, so the address names a choice only when it differs.
    const fallback = small ? 'list' : 'board';
    setParams(next === fallback ? {} : { view: next === 'list' ? LIST_VIEW : CANVAS_VIEW });
  };

  // A new card goes in the middle of the visible board. If a card is already there, it moves one card
  // to the right until the place is free, so two new cards never hide each other.
  const addAt = (): { x: number; y: number } => {
    let at: { x: number; y: number };
    if (view && size.current) {
      const middle = toBoard(view, { x: size.current.width / 2, y: size.current.height / 2 });
      at = { x: snap(middle.x - CARD_WIDTH / 2), y: snap(middle.y - CARD_HEIGHT / 2) };
    } else {
      at = { x: 0, y: rows.cards.reduce((y, c) => Math.max(y, c.y + CARD_HEIGHT + 48), 0) };
    }
    const taken = (p: { x: number; y: number }) =>
      rows.cards.some((c) => Math.abs(c.x - p.x) < CARD_WIDTH && Math.abs(c.y - p.y) < CARD_HEIGHT);
    for (let step = 0; step < 50 && taken(at); step += 1) at = { ...at, x: at.x + CARD_WIDTH + GRID * 3 };
    return at;
  };

  const fromScenes = () => {
    cardsFromScenes(project.id, scenes).then(
      (made) => {
        if (made === 0) {
          announce('Every scene has a card.');
          return;
        }
        announce(made === 1 ? 'Made 1 card from a scene.' : `Made ${String(made)} cards from scenes.`);
        // The next look at the board shows every card, the new ones too.
        setView(null);
      },
      () => {
        announce('Vlo could not make the cards on this device.');
      },
    );
  };

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
        <Button
          variant="outline"
          onClick={() => {
            setCardForm({ type: 'add', at: addAt() });
          }}
        >
          <Plus aria-hidden="true" className="size-4" />
          Add card
        </Button>
        <Button variant="outline" onClick={fromScenes} disabled={scenes.length === 0}>
          <Sparkles aria-hidden="true" className="size-4" />
          Cards from scenes
        </Button>
        <Button
          variant="outline"
          onClick={() => {
            setThreadsOpen(true);
          }}
        >
          <Layers aria-hidden="true" className="size-4" />
          Threads
        </Button>
        {mode !== 'grid' && (
          <div
            role="group"
            aria-label="Show the board as"
            className="ml-auto flex rounded-md border border-rule p-0.5"
          >
            {(['board', 'list'] as const).map((option) => (
              <button
                key={option}
                type="button"
                aria-pressed={mode === option}
                onClick={() => {
                  showMode(option);
                }}
                className={cn(
                  'flex min-h-10 items-center gap-1.5 rounded-[5px] px-3 text-sm font-medium',
                  mode === option ? 'bg-text text-bg' : 'text-muted hover:text-text',
                )}
              >
                {option === 'list' && <Rows3 aria-hidden="true" className="size-4" />}
                {option === 'board' ? 'Canvas' : 'List'}
              </button>
            ))}
          </div>
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
              const card = deleted.card;
              restoreCard(deleted).then(
                () => {
                  announce(`Restored the card ${card.title}.`);
                },
                () => {
                  announce('Vlo could not restore the card on this device.');
                },
              );
            }}
          >
            Undo
          </Button>
        )}
      </div>

      {mode === 'board' && (
        <Canvas
          cards={rows.cards}
          threads={rows.threads}
          links={rows.links}
          itemTitles={itemTitles}
          view={view}
          onView={setView}
          actions={actions}
          motion={motion}
          announce={announce}
          onSize={onSize}
        />
      )}
      {mode === 'list' && (
        <BoardList
          cards={rows.cards}
          threads={rows.threads}
          links={rows.links}
          itemTitles={itemTitles}
          actions={actions}
        />
      )}
      {mode === 'grid' && (
        <PlotGridView
          items={items}
          cards={rows.cards}
          threads={rows.threads}
          links={rows.links}
          actions={actions}
          announce={announce}
        />
      )}

      <CardDialog
        target={cardForm}
        projectId={project.id}
        items={cardItems}
        onClose={() => {
          setCardForm(null);
        }}
        onSaved={announce}
      />
      <LinkDialog
        card={linking}
        cards={rows.cards}
        threads={rows.threads}
        links={rows.links}
        onClose={() => {
          setLinking(null);
        }}
        onSaved={announce}
      />
      <ThreadsDialog
        open={threadsOpen}
        projectId={project.id}
        threads={rows.threads}
        onClose={() => {
          setThreadsOpen(false);
        }}
        onSaved={announce}
      />
    </section>
  );
}
