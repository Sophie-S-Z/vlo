import type { CSSProperties, FocusEvent, MouseEvent, PointerEvent } from 'react';
import { Link } from 'react-router';
import type { Project, Series } from '@/lib/db';
import { MotionViewTransition } from '@/ui/MotionViewTransition';
import type { BookLook } from './book';
import { projectTransitionName } from './ProjectCard';
import { ProjectMenu, type ProjectActions } from './ProjectMenu';
import { Sigil } from './Sigil';

interface BookSpineProps extends ProjectActions {
  project: Project;
  look: BookLook;
  /** The kind of work, such as "Novel". */
  label: string;
  /** "1,204 words". */
  words: string;
  /** "Backed up today". */
  backup: string;
  due: boolean;
  index: number;
  series: Series | undefined;
  opening: boolean;
  onOpen: (event: MouseEvent<HTMLAnchorElement>) => void;
  onShow: (event: PointerEvent<HTMLLIElement> | FocusEvent<HTMLLIElement>) => void;
  onHide: () => void;
}

/**
 * One project as a book on the shelf. The link stays still as the target of the pointer, and only the book
 * inside it moves, so the book never slides out from under the pointer. The words, kind and backup state
 * are for screen readers here; a sighted writer sees them on the card over the book (Bookshelf).
 */
export function BookSpine({
  project,
  look,
  label,
  words,
  backup,
  due,
  index,
  series,
  opening,
  onOpen,
  onShow,
  onHide,
  ...actions
}: BookSpineProps) {
  const style = {
    '--i': index,
    '--w': `${String(look.width)}px`,
    '--h': `${String(look.height)}px`,
    '--lean': `${String(look.lean)}deg`,
    '--depth': `${String(look.depth)}px`,
    '--spine': look.spine,
    '--ink': look.ink,
    '--band': look.band,
  } as CSSProperties;
  return (
    // The book morphs into the project screen, and between the shelf and the list.
    <MotionViewTransition name={projectTransitionName(project.id)}>
      <li
        className="vlo-book"
        style={style}
        data-opening={opening || undefined}
        onPointerEnter={onShow}
        onPointerLeave={onHide}
        onFocus={onShow}
        onBlur={onHide}
      >
        <Link to={`/p/${project.id}`} className="vlo-book-hit" draggable={false} onClick={onOpen}>
          <span className="vlo-book-body" data-finish={look.finish}>
            <span className="vlo-book-spine">
              <span className="vlo-book-band" />
              <span className="vlo-book-title" data-face={look.face} data-caps={look.caps || undefined}>
                {project.title}
              </span>
              <Sigil seed={project.id} className="vlo-book-mark" />
              <span className="vlo-book-band" />
            </span>
            <span aria-hidden="true" className="vlo-book-cover">
              {/* The cover draws its words from data attributes, so the page holds each word once. */}
              <span className="vlo-book-cover-kind" data-text={label} />
              <span className="vlo-book-cover-title" data-text={project.title} />
              <Sigil seed={project.id} className="vlo-book-cover-mark" />
            </span>
            <span aria-hidden="true" className="vlo-book-back" />
          </span>
        </Link>
        <p className="sr-only">{label}</p>
        <p className="sr-only">{words}</p>
        <p className="sr-only">
          {backup}
          {due && '. Time for a backup.'}
        </p>
        <ProjectMenu project={project} series={series} {...actions} className="vlo-book-ribbon" />
      </li>
    </MotionViewTransition>
  );
}
