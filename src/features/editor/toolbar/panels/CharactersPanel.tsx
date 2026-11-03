import type { Editor } from '@tiptap/core';
import { Search } from 'lucide-react';
import { useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import {
  CHARACTER_CATEGORIES,
  characterEntry,
  searchCharacters,
  type CharEntry,
} from '../../format/characters';
import { recentCharacters, rememberCharacter } from '../../format/recentCharacters';
import { insertText } from '../../commands/registry';

const COLUMNS = 8;
const RECENT = 'recent';

/**
 * A searchable grid of special characters. Arrow keys move in the grid and Enter inserts. The panel stays
 * open, so the writer can add several characters in a row.
 */
export function CharactersPanel({ editor }: { editor: Editor }) {
  const [recent, setRecent] = useState(recentCharacters);
  const [query, setQuery] = useState('');
  // Recent picks show first until the writer chooses another group.
  const [picked, setPicked] = useState<string | null>(null);
  const category = picked ?? (recent.length > 0 ? RECENT : 'punctuation');
  const [active, setActive] = useState(0);
  const [said, setSaid] = useState('');
  const grid = useRef<HTMLDivElement>(null);
  const searchId = useId();

  const recentEntries = useMemo(
    () => recent.map((char) => characterEntry(char) ?? { char, name: char }),
    [recent],
  );
  const entries: readonly CharEntry[] =
    query.trim() !== ''
      ? searchCharacters(query)
      : category === RECENT
        ? recentEntries
        : (CHARACTER_CATEGORIES.find((c) => c.id === category)?.entries ?? []);
  const index = Math.min(active, Math.max(entries.length - 1, 0));

  const insert = (entry: CharEntry) => {
    if (!insertText(editor, entry.char)) return;
    setRecent(rememberCharacter(entry.char));
    setSaid(`Inserted ${entry.name}.`);
  };

  const focusCell = (next: number) => {
    const bounded = Math.min(Math.max(next, 0), entries.length - 1);
    setActive(bounded);
    grid.current?.querySelector<HTMLElement>(`[data-index="${String(bounded)}"]`)?.focus();
  };

  const onGridKey = (event: KeyboardEvent) => {
    const moves: Record<string, number> = {
      ArrowRight: 1,
      ArrowLeft: -1,
      ArrowDown: COLUMNS,
      ArrowUp: -COLUMNS,
    };
    const move = moves[event.key];
    if (move !== undefined) {
      event.preventDefault();
      focusCell(index + move);
    } else if (event.key === 'Home') {
      event.preventDefault();
      focusCell(0);
    } else if (event.key === 'End') {
      event.preventDefault();
      focusCell(entries.length - 1);
    }
  };

  const tabs = [
    ...(recent.length > 0 ? [{ id: RECENT, label: 'Recent' }] : []),
    ...CHARACTER_CATEGORIES.map((c) => ({ id: c.id, label: c.label })),
  ];

  return (
    <div className="grid gap-3">
      <h2 className="text-sm font-medium">Special characters</h2>
      <div className="relative">
        <Search aria-hidden="true" className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" />
        <label htmlFor={searchId} className="sr-only">
          Find a character by name
        </label>
        <input
          id={searchId}
          type="search"
          value={query}
          autoComplete="off"
          spellCheck={false}
          placeholder="Find: em dash, alpha, heart"
          onChange={(event) => {
            setQuery(event.target.value);
            setActive(0);
          }}
          onKeyDown={(event) => {
            if (event.key === 'ArrowDown' && entries.length > 0) {
              event.preventDefault();
              focusCell(0);
            } else if (event.key === 'Enter' && entries[0]) {
              event.preventDefault();
              insert(entries[0]);
            }
          }}
          className="min-h-11 w-full rounded-md border border-rule bg-bg pr-3 pl-9 text-base text-text placeholder:text-muted focus-visible:border-accent pointer-fine:min-h-9 pointer-fine:text-sm"
        />
      </div>

      {query.trim() === '' && (
        <div
          role="group"
          aria-label="Character groups"
          className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1"
        >
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              aria-pressed={category === tab.id}
              onClick={() => {
                setPicked(tab.id);
                setActive(0);
              }}
              className="min-h-9 shrink-0 rounded-full border border-rule px-3 text-xs whitespace-nowrap text-muted hover:text-text aria-pressed:border-accent aria-pressed:text-accent-text"
            >
              {tab.label}
            </button>
          ))}
        </div>
      )}

      {entries.length === 0 ? (
        <p className="py-4 text-center text-sm text-muted">
          {query.trim() === ''
            ? 'No recent characters yet.'
            : 'No character has that name. Try a shorter word.'}
        </p>
      ) : (
        <div
          ref={grid}
          role="group"
          aria-label={query.trim() === '' ? (tabs.find((t) => t.id === category)?.label ?? '') : 'Matches'}
          className="grid max-h-60 grid-cols-8 gap-1 overflow-y-auto"
        >
          {entries.map((entry, i) => (
            <button
              key={`${entry.char}-${entry.name}`}
              type="button"
              data-index={i}
              tabIndex={i === index ? 0 : -1}
              aria-label={entry.name}
              title={entry.name}
              onFocus={() => {
                setActive(i);
              }}
              onKeyDown={onGridKey}
              onClick={() => {
                insert(entry);
              }}
              className="flex aspect-square items-center justify-center rounded-md border border-transparent font-manuscript text-xl outline-none hover:border-rule hover:bg-bg focus-visible:ring-2 focus-visible:ring-accent"
            >
              <span aria-hidden="true">{entry.char}</span>
            </button>
          ))}
        </div>
      )}
      <p aria-hidden="true" className="min-h-4 text-xs text-muted">
        {entries[index]?.name}
      </p>
      <p role="status" className="sr-only">
        {said}
      </p>
    </div>
  );
}
