# ADR 0003: Keep a plain-text copy of each item

- Status: accepted
- Date: 2026-11-02

## Context

Each item's text is a Yjs document stored by y-indexeddb in its own database, `vlo-item-<itemId>`. Only the open item's document loads, so a 100,000-word project opens fast (spec section 7).

Some features need the text of every item at once:

- The command menu searches all items (Phase 1, F11).
- Backups write a readable `.md` copy of each item next to the Yjs state (Phase 2, F06).
- The Library and the binder show word counts for items that are not open.

Opening every Yjs document for these would break the load budget.

## Decision

- A Dexie table `itemTexts` holds `{ itemId, projectId, text, updatedAt }`, one row per item.
- The editor writes the row 600 ms after the writer stops typing, in the same Dexie transaction that sets the item's `wordCount` (and `lineCount` for poems) and the project's `updatedAt`.
- If the writer leaves the item during the pause, the row is still written.
- Poem text comes from `poemDataToText`, so it keeps every space. Prose text separates blocks with one blank line and writes a scene break as `#`.
- Deleting an item or project deletes its rows.

## Consequences

- Search and backups read one small table, not every Yjs database.
- The copy can be up to 600 ms behind the Yjs document. A crash inside that window leaves the copy one pause behind. The next edit or the next backup (which reads the Yjs state) corrects it.
- The text exists twice on the device. For a 100,000-word project this is about 600 KB more storage.
