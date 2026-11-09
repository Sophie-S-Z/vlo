import { useLayoutEffect, useMemo, useRef } from 'react';
import { Link } from 'react-router';
import { useMotionAllowed } from '@/app/PreferencesProvider';
import { STATUS_LABEL } from '@/features/binder/BinderItem';
import { openTargets } from '@/features/binder/tree';
import { formatWords } from '@/features/library/format';
import { countUnit } from '@/lib/wordcount';
import { projectDef } from '@/features/library/templates';
import type { Item, Project, Status } from '@/lib/db';
import { cn } from '@/ui/cn';

/*
 * The progress map (spec 8.4, plan Task C9, F21): one tile per item in binder order, colored by status. The
 * tiles enter as a mosaic: each one starts after a delay that grows with its distance from the center of
 * the map. Calm mode and reduced motion show the tiles at once.
 */

export const STATUSES: readonly Status[] = ['idea', 'draft', 'revised', 'done'];

/** Each status as a fill. The status shows as words in the tile name too, so color is never the only sign. */
export const TILE_TONE: Record<Status, string> = {
  idea: 'vlo-tile-idea',
  draft: 'vlo-tile-draft',
  revised: 'vlo-tile-revised',
  done: 'vlo-tile-done',
};

const SPREAD_MS = 360;
const TILE_MS = 420;

export function Tiles({ project, items }: { project: Project; items: readonly Item[] }) {
  const motion = useMotionAllowed();
  const listRef = useRef<HTMLUListElement>(null);
  const played = useRef(false);
  const template = projectDef(project);
  const targets = useMemo(() => openTargets(items, template.editorKind), [items, template]);

  // Once, when the map first shows. All reads come before the animations start.
  useLayoutEffect(() => {
    const list = listRef.current;
    if (played.current || !motion || !list) return;
    played.current = true;
    const tiles = Array.from(list.children) as HTMLElement[];
    const box = list.getBoundingClientRect();
    const cx = box.left + box.width / 2;
    const cy = box.top + box.height / 2;
    const distances = tiles.map((tile) => {
      const rect = tile.getBoundingClientRect();
      return Math.hypot(rect.left + rect.width / 2 - cx, rect.top + rect.height / 2 - cy);
    });
    const far = Math.max(1, ...distances);
    tiles.forEach((tile, i) => {
      tile.animate(
        [
          { opacity: 0, transform: 'scale(0.6)' },
          { opacity: 1, transform: 'none' },
        ],
        {
          duration: TILE_MS,
          delay: ((distances[i] ?? 0) / far) * SPREAD_MS,
          easing: 'cubic-bezier(0.165, 0.84, 0.44, 1)',
          fill: 'backwards',
        },
      );
    });
  }, [motion]);

  return (
    <ul
      ref={listRef}
      aria-label="Items by status"
      data-testid="progress-tiles"
      className="grid grid-cols-[repeat(auto-fill,minmax(6.5rem,1fr))] gap-1.5"
    >
      {items.map((item) => {
        const kind = template.kindLabel[item.kind] ?? item.kind;
        const target = targets.get(item.id);
        const name = `${item.title}, ${kind.toLowerCase()}, ${STATUS_LABEL[item.status].toLowerCase()}, ${formatWords(item.wordCount, countUnit(project.settings.language))}`;
        const body = (
          <>
            <span className="line-clamp-2 text-sm leading-snug font-medium [overflow-wrap:anywhere]">
              {item.title}
            </span>
            <span className="mt-auto text-xs tabular-nums">{item.wordCount.toLocaleString()}</span>
          </>
        );
        const tile = cn(
          'vlo-tile flex aspect-square flex-col gap-1 rounded-md p-2 no-underline',
          TILE_TONE[item.status],
        );
        return (
          <li key={item.id} data-status={item.status} className="min-w-0">
            {target ? (
              <Link
                to={`/p/${project.id}?${new URLSearchParams({ item: target.id }).toString()}`}
                aria-label={name}
                className={cn(tile, 'hover:-translate-y-0.5 focus-visible:-translate-y-0.5')}
              >
                {body}
              </Link>
            ) : (
              <span role="img" aria-label={name} className={tile}>
                {body}
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}
