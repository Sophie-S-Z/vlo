# ADR 0017: The writer edits the entries of History, not their text

- Status: accepted
- Date: 2026-11-24

## Context

History lists the snapshots and the named versions of an item. Before this change, the writer could only
rename a version. A snapshot had a fixed label, and its date was the time when Vlo saved it.

The owner asked for robust version and edit history, with entries that the writer can edit. The owner
chose "Manage entries only": the writer changes the name, the note, the pin and the date of an entry. The
text inside a snapshot or a version never changes. Then the owner asked for an editable date and time.

## Decision

- A snapshot has an optional `note`, `pinned` and `shownAt`. A version has an optional `note` and
  `shownAt`. A note has 1,000 characters at most. An empty note or no pin leaves no field.
- `shownAt` is the date and time that the writer gives. It cannot be in the future. `createdAt` stays the
  true save time, and a date equal to it leaves no `shownAt`.
- History sorts and groups the entries by `shownAt`, or by `createdAt` when there is no `shownAt`. Each
  entry with a date of the writer also shows its true save time.
- Thinning (ADR 0015) uses only `createdAt`. A date of the writer cannot save an old automatic snapshot,
  and it cannot delete a new one. A name or a pin keeps a snapshot always.
- The writer can keep a snapshot as a named version. The version obeys the rules of a version: a unique
  name and 20 versions at most.
- The writer can delete one snapshot, and Undo puts it back as it was.
- The new fields are optional and have no index, so the Dexie schema does not change. A backup checks them
  and keeps `BACKUP_VERSION` 17. An older build keeps the fields and shows the true save time. Versions sync
  the new fields as part of the row.

## Consequences

- The writer can label the drafts of an item with names, notes and dates that match the writing.
- The text of History stays a true record. Restore, Compare and Use this always give the saved text.
- A snapshot that the writer names or pins never thins, so pins can add to the storage of an item.
- The date field has whole seconds. An unchanged field keeps the exact time, so a save changes nothing.
