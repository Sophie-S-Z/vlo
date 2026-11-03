import { Command } from 'cmdk';
import type { MatchInfo } from 'minisearch';
import { useEffect, useMemo, useState } from 'react';
import type { Item, ItemText, Project } from '@/lib/db';
import { db } from '@/lib/db';
import { cn } from '@/ui/cn';
import { buildSearchIndex, snippet } from './searchIndex';

export interface CommandAction {
  id: string;
  label: string;
  run: () => void;
  /** More words that find the action. */
  keywords?: readonly string[];
  /** The shortcut, shown at the end of the row. */
  hint?: string;
  /** Format actions act on the open text and list after the other actions. */
  group?: 'actions' | 'format';
}

/** True when every query word is in the action's label or keywords. */
export function actionMatches(action: CommandAction, query: string): boolean {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const haystack = [action.label, ...(action.keywords ?? [])].join(' ').toLowerCase();
  return words.every((w) => haystack.includes(w));
}

interface CommandMenuProps {
  project: Project;
  items: readonly Item[];
  /** The items the writer can open in the editor. */
  canOpen: (item: Item) => boolean;
  actions: readonly CommandAction[];
  onOpenItem: (itemId: string) => void;
  /** Closes the menu. */
  onDone: () => void;
}

/** True when a result matched `field` for at least one query word. */
function matchedIn(result: { match: MatchInfo }, field: string): boolean {
  return Object.values(result.match).some((fields) => fields.includes(field));
}

const itemClass =
  'flex min-h-11 cursor-default flex-col justify-center gap-0.5 rounded-md px-3 py-2 text-sm outline-none select-none data-[selected=true]:bg-bg';
const groupClass =
  '[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:pt-3 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted';

/**
 * Mod-K: jump to an item by title, find text in any item, or run an action. Loaded on first open,
 * with MiniSearch, so the editor route does not carry them.
 */
export function CommandMenu({ project, items, canOpen, actions, onOpenItem, onDone }: CommandMenuProps) {
  const [query, setQuery] = useState('');
  const [texts, setTexts] = useState<ItemText[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    void db.itemTexts
      .where('projectId')
      .equals(project.id)
      .toArray()
      .then((rows) => {
        if (!cancelled) setTexts(rows);
      });
    return () => {
      cancelled = true;
    };
  }, [project.id]);

  const index = useMemo(() => buildSearchIndex(texts ?? [], items), [texts, items]);
  const textById = useMemo(() => new Map((texts ?? []).map((t) => [t.itemId, t.text])), [texts]);
  const byId = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  const trimmed = query.trim();

  const found = (trimmed === '' ? [] : index.search(trimmed)).map((r) => ({
    id: String(r.id),
    match: r.match,
  }));
  const queryWords = trimmed.split(/\s+/).filter(Boolean);
  // Chapters and parts have no editor, so the menu leaves them out.
  const openable = (id: string) => {
    const item = byId.get(id);
    return item && canOpen(item) ? item : undefined;
  };
  const titleHits =
    trimmed === ''
      ? items.filter(canOpen)
      : found
          .filter((r) => matchedIn(r, 'title'))
          .map((r) => openable(r.id))
          .filter((i) => i !== undefined);
  const textHits = found
    .filter((r) => matchedIn(r, 'text'))
    .map((r) => ({ item: openable(r.id), terms: [...queryWords, ...Object.keys(r.match)] }))
    .filter((r): r is { item: Item; terms: string[] } => r.item !== undefined);
  const shownActions = actions.filter((a) => a.group !== 'format' && actionMatches(a, trimmed));
  const shownFormats = actions.filter((a) => a.group === 'format' && actionMatches(a, trimmed));

  const choose = (run: () => void) => {
    run();
    onDone();
  };

  return (
    <Command label="Command menu" shouldFilter={false} loop className="grid gap-2">
      <Command.Input
        value={query}
        onValueChange={setQuery}
        placeholder="Find an item or text, or run an action"
        className="min-h-12 w-full rounded-md border border-rule bg-bg px-3 text-base text-text outline-none placeholder:text-muted focus-visible:border-accent"
      />
      <Command.List className="max-h-[min(60vh,28rem)] overflow-y-auto">
        <Command.Empty className="px-3 py-6 text-center text-sm text-muted">Nothing matches.</Command.Empty>
        {titleHits.length > 0 && (
          <Command.Group heading="Items" className={groupClass}>
            {titleHits.map((item) => (
              <Command.Item
                key={item.id}
                value={`item-${item.id}`}
                onSelect={() => {
                  choose(() => {
                    onOpenItem(item.id);
                  });
                }}
                className={itemClass}
              >
                <span>{item.title}</span>
              </Command.Item>
            ))}
          </Command.Group>
        )}
        {textHits.length > 0 && (
          <Command.Group heading="Text" className={groupClass}>
            {textHits.map(({ item, terms }) => (
              <Command.Item
                key={item.id}
                value={`text-${item.id}`}
                onSelect={() => {
                  choose(() => {
                    onOpenItem(item.id);
                  });
                }}
                className={itemClass}
              >
                <span>{item.title}</span>
                <span className="text-xs text-muted">{snippet(textById.get(item.id) ?? '', terms)}</span>
              </Command.Item>
            ))}
          </Command.Group>
        )}
        {shownActions.length > 0 && (
          <Command.Group heading="Actions" className={groupClass}>
            {shownActions.map((action) => (
              <Command.Item
                key={action.id}
                value={`action-${action.id}`}
                onSelect={() => {
                  choose(action.run);
                }}
                className={itemClass}
              >
                {action.label}
              </Command.Item>
            ))}
          </Command.Group>
        )}
        {shownFormats.length > 0 && (
          <Command.Group heading="Format" className={groupClass}>
            {shownFormats.map((action) => (
              <Command.Item
                key={action.id}
                value={`format-${action.id}`}
                onSelect={() => {
                  choose(action.run);
                }}
                className={cn(itemClass, 'flex-row items-center justify-between')}
              >
                <span>{action.label}</span>
                {action.hint && (
                  <span aria-hidden="true" className="font-mono text-xs text-muted">
                    {action.hint}
                  </span>
                )}
              </Command.Item>
            ))}
          </Command.Group>
        )}
      </Command.List>
    </Command>
  );
}
