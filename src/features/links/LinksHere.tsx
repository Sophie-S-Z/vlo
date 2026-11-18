import { useId } from 'react';
import { Button } from '@/ui/button';
import { shownTitle } from '@/features/editor/format/itemLink';
import { followLink, linksTo, useLinks } from './linkStore';

/**
 * "Links here" in the details panel (Phase 19, Task F1): the items whose text links to the open item. A
 * click opens one, and Ctrl or ⌘ as you click opens it beside, as a link in the text does.
 */
export function LinksHere({ itemId }: { itemId: string }) {
  const headingId = useId();
  const from = linksTo(itemId, useLinks());
  return (
    <section aria-labelledby={headingId} className="grid gap-1.5 text-sm">
      <h2 id={headingId} className="text-muted">
        Links here
      </h2>
      {from.length === 0 ? (
        <p>No item links here yet. Type [[ in a text to link to an item.</p>
      ) : (
        <ul className="grid gap-0.5">
          {from.map((source) => (
            <li key={source.id}>
              <Button
                variant="ghost"
                className="-mx-2 w-[calc(100%+1rem)] justify-start px-2 text-left text-text pointer-fine:min-h-9"
                onClick={(event) => {
                  followLink({ item: source.id }, event.metaKey || event.ctrlKey);
                }}
              >
                <span className="truncate">{shownTitle(source.title)}</span>
              </Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
