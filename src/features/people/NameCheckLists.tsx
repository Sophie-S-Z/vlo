import { useId } from 'react';
import type { NameCheck } from '@/lib/privacy';

/*
 * The check before a share-safe export or a memoir share link (plan Tasks C5 and E3): the real names with
 * no mark, and the marked text that is no longer a name. Each dialog adds its own buttons.
 */

/** The name check's Mark all failed. */
export const FAILED = -1;

interface NameCheckListsProps {
  names: NameCheck;
  /** The result of Mark all: the count it marked, FAILED, or null before the writer chooses it. */
  marked: number | null;
  /** What the check is for, in the sentence about changed names. */
  what: 'export' | 'link';
}

function times(count: number): string {
  return count === 1 ? '1 time' : `${String(count)} times`;
}

export function NameCheckLists({ names, marked, what }: NameCheckListsProps) {
  const ids = useId();
  return (
    <>
      {names.unmarked.length > 0 && marked === null && (
        <section aria-labelledby={`${ids}-unmarked`} className="grid gap-2">
          <h3 id={`${ids}-unmarked`} className="text-sm font-semibold">
            Real names with no mark
          </h3>
          <ul className="grid gap-1 text-sm">
            {names.unmarked.map((name) => (
              <li
                key={name.name}
                className="flex justify-between gap-3 rounded-[var(--radius-card)] bg-bg px-3 py-2"
              >
                <span className="font-medium [overflow-wrap:anywhere]">{name.name}</span>
                <span className="shrink-0 text-muted">{times(name.count)}</span>
              </li>
            ))}
          </ul>
          <p className="text-sm text-muted">
            Mark them, so the editor shows each one and Show aliases previews it.
          </p>
        </section>
      )}
      {marked !== null && (
        <p role="status" className="text-sm">
          {marked === FAILED
            ? `Vlo could not mark the names on this device. The ${what} still uses the aliases.`
            : marked === 0
              ? 'Every real name in the text has a mark now.'
              : `Marked ${String(marked)} ${marked === 1 ? 'name' : 'names'}.`}
        </p>
      )}
      {names.changed.length > 0 && (
        <section aria-labelledby={`${ids}-changed`} className="grid gap-2">
          <h3 id={`${ids}-changed`} className="text-sm font-semibold">
            Marked text that is no longer a name
          </h3>
          <ul className="grid gap-1 text-sm">
            {names.changed.map((name) => (
              <li
                key={name.name}
                className="flex justify-between gap-3 rounded-[var(--radius-card)] bg-bg px-3 py-2"
              >
                <span className="font-medium [overflow-wrap:anywhere]">“{name.name}”</span>
                <span className="shrink-0 text-muted">{times(name.count)}</span>
              </li>
            ))}
          </ul>
          <p className="text-sm text-muted">
            An edit split or changed these names. The {what} shows the person&apos;s first alias for each. Fix
            the text, or select it and choose Mark as person again.
          </p>
        </section>
      )}
    </>
  );
}
