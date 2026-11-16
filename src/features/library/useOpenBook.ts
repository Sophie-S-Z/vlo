import { useEffect, useRef, useState, type MouseEvent } from 'react';
import { useNavigate } from 'react-router';
import { useMotionAllowed } from '@/app/PreferencesProvider';

/** How long a book takes to come out of the shelf or the stack before its project opens, in ms. */
const OPEN_MS = 560;

/** Loads the code of the project screen early, so the page is ready when the book opens. */
export function preloadProject() {
  void import('@/features/project/ProjectPage');
}

/**
 * A plain click on a book takes it out first, then opens the project. A click with a modifier key, and
 * every click with motion off, opens the link at once.
 */
export function useOpenBook() {
  const motion = useMotionAllowed();
  const navigate = useNavigate();
  const [opening, setOpening] = useState<string | null>(null);
  const timer = useRef(0);

  useEffect(
    () => () => {
      window.clearTimeout(timer.current);
    },
    [],
  );

  const open = (id: string) => (event: MouseEvent<HTMLAnchorElement>) => {
    const plain = event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey;
    if (!motion || !plain || opening !== null) return;
    event.preventDefault();
    setOpening(id);
    // The page with the open book crossfades into the project.
    timer.current = window.setTimeout(() => {
      void navigate(`/p/${id}`, { viewTransition: true });
    }, OPEN_MS);
  };

  return { opening, open };
}
