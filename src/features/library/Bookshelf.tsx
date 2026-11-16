import { useEffect, useLayoutEffect, useRef, useState, type MouseEvent } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router';
import { useMotionAllowed } from '@/app/PreferencesProvider';
import type { Project, Series } from '@/lib/db';
import { countUnit } from '@/lib/wordcount';
import { backupDue, backupLabel } from '@/features/backup/reminder';
import { bookLook } from './book';
import { BookSpine } from './BookSpine';
import { formatWords } from './format';
import type { ProjectActions } from './ProjectMenu';
import { projectDef } from './templates';
import type { LibraryProject } from './useLibrary';

/** The most that a book at the edge of the shelf turns, in degrees. */
const CURVE = 34;
/** How long a book takes to come off the shelf before its project opens, in ms. */
const OPEN_MS = 520;
/** A press that moves more than this many pixels drags the shelf instead of opening a book. */
const DRAG_PX = 6;

interface Shown {
  title: string;
  label: string;
  words: string;
  backup: string;
  due: boolean;
  x: number;
  y: number;
}

interface BookshelfProps {
  projects: LibraryProject[];
  now: number;
  seriesOf: (project: Project) => Series | undefined;
  actionsFor: (project: Project) => ProjectActions;
}

/**
 * The shelf layout of the Library: one row of books on a plank. The row bends away at its edges, so the
 * books there show their covers. The wheel, a mouse drag and Tab move along the row. Hover or
 * focus pulls a book forward and shows a card with its details; a click takes the book off the shelf and
 * opens the project. Calm mode and reduced motion keep every pose and drop the movement between them.
 */
export function Bookshelf({ projects, now, seriesOf, actionsFor }: BookshelfProps) {
  const motion = useMotionAllowed();
  const navigate = useNavigate();
  const shelfRef = useRef<HTMLUListElement>(null);
  const [shown, setShown] = useState<Shown | null>(null);
  const [opening, setOpening] = useState<string | null>(null);
  const hideTimer = useRef(0);
  const openTimer = useRef(0);
  const drag = useRef({ x: 0, left: 0, active: false, moved: false });

  // Each book turns by its distance from the middle of the view. A book on the left half sits in front of
  // its neighbour on the right, and the other way round on the right half, so the covers overlap in order.
  const bend = () => {
    const shelf = shelfRef.current;
    if (!shelf) return;
    const middle = shelf.scrollLeft + shelf.clientWidth / 2;
    const half = Math.max(1, shelf.clientWidth / 2);
    const books = Array.from(shelf.children) as HTMLElement[];
    books.forEach((book, i) => {
      const t = Math.max(-1, Math.min(1, (book.offsetLeft + book.offsetWidth / 2 - middle) / half));
      book.style.setProperty('--ry', `${(Math.sign(t) * Math.abs(t) ** 1.35 * CURVE).toFixed(2)}deg`);
      book.style.zIndex = String(t <= 0 ? i + 1 : books.length - i);
    });
  };

  // The bend follows the scroll, a resize and a change of the books.
  useLayoutEffect(bend, [projects]);
  useEffect(() => {
    const shelf = shelfRef.current;
    if (!shelf) return;
    let frame = 0;
    const queue = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(bend);
    };
    // The wheel moves along the row while the row can still move, then gives the scroll back to the page.
    const wheel = (event: WheelEvent) => {
      if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
      const max = shelf.scrollWidth - shelf.clientWidth;
      const atStart = shelf.scrollLeft <= 0 && event.deltaY < 0;
      const atEnd = shelf.scrollLeft >= max - 1 && event.deltaY > 0;
      if (max <= 0 || atStart || atEnd) return;
      event.preventDefault();
      shelf.scrollLeft += event.deltaY;
    };
    const scroll = () => {
      setShown(null);
      queue();
    };
    shelf.addEventListener('wheel', wheel, { passive: false });
    shelf.addEventListener('scroll', scroll, { passive: true });
    const resize = typeof ResizeObserver === 'function' ? new ResizeObserver(queue) : null;
    resize?.observe(shelf);
    return () => {
      cancelAnimationFrame(frame);
      shelf.removeEventListener('wheel', wheel);
      shelf.removeEventListener('scroll', scroll);
      resize?.disconnect();
    };
  }, []);

  useEffect(
    () => () => {
      window.clearTimeout(hideTimer.current);
      window.clearTimeout(openTimer.current);
    },
    [],
  );

  const open = (id: string) => (event: MouseEvent<HTMLAnchorElement>) => {
    const plain = event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey;
    if (!motion || !plain || opening !== null) return;
    event.preventDefault();
    setShown(null);
    setOpening(id);
    openTimer.current = window.setTimeout(() => {
      void navigate(`/p/${id}`);
    }, OPEN_MS);
  };

  return (
    <div className="vlo-shelf-wrap">
      <ul
        ref={shelfRef}
        aria-label="Projects"
        className="vlo-shelf"
        data-opening={opening !== null || undefined}
        onPointerDown={(event) => {
          if (event.pointerType !== 'mouse' || event.button !== 0) return;
          drag.current = {
            x: event.clientX,
            left: event.currentTarget.scrollLeft,
            active: true,
            moved: false,
          };
        }}
        onPointerMove={(event) => {
          const state = drag.current;
          if (!state.active) return;
          const dx = event.clientX - state.x;
          if (!state.moved && Math.abs(dx) < DRAG_PX) return;
          state.moved = true;
          event.currentTarget.scrollLeft = state.left - dx;
        }}
        onPointerUp={() => {
          drag.current.active = false;
        }}
        onPointerLeave={() => {
          drag.current.active = false;
        }}
        // A drag ends with a click on the book under the pointer. That click only ends the drag.
        onClickCapture={(event) => {
          if (!drag.current.moved) return;
          drag.current.moved = false;
          event.preventDefault();
          event.stopPropagation();
        }}
      >
        {projects.map(({ project, wordCount }, index) => {
          const label = projectDef(project).label;
          const words = formatWords(wordCount, countUnit(project.settings.language));
          const backup = backupLabel(project, now);
          const due = backupDue(project, now);
          return (
            <BookSpine
              key={project.id}
              project={project}
              look={bookLook(project, wordCount)}
              label={label}
              words={words}
              backup={backup}
              due={due}
              index={index}
              series={seriesOf(project)}
              opening={opening === project.id}
              onOpen={open(project.id)}
              onShow={(event) => {
                window.clearTimeout(hideTimer.current);
                if (opening !== null) return;
                const box = event.currentTarget.getBoundingClientRect();
                setShown({
                  title: project.title,
                  label,
                  words,
                  backup,
                  due,
                  x: box.left + box.width / 2,
                  y: box.top,
                });
              }}
              onHide={() => {
                // A short grace keeps the card from flickering while the book moves under the pointer.
                window.clearTimeout(hideTimer.current);
                hideTimer.current = window.setTimeout(() => {
                  setShown(null);
                }, 90);
              }}
              {...actionsFor(project)}
            />
          );
        })}
      </ul>
      <div aria-hidden="true" className="vlo-shelf-plank" />
      {shown &&
        createPortal(
          <div
            aria-hidden="true"
            className="vlo-book-card"
            style={{
              left: Math.min(Math.max(shown.x, 140), window.innerWidth - 140),
              top: shown.y,
            }}
          >
            <p className="font-display text-xl leading-tight font-medium [overflow-wrap:anywhere]">
              {shown.title}
            </p>
            <p className="vlo-eyebrow mt-1.5">{shown.label}</p>
            <p className="mt-3 font-mono text-xs text-muted tabular-nums">{shown.words}</p>
            <p className={`font-mono text-xs ${shown.due ? 'text-accent-text' : 'text-muted'}`}>
              {shown.backup}
            </p>
          </div>,
          document.body,
        )}
    </div>
  );
}
