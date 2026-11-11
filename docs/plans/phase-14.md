# Phase 14: Continuity

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Status:** the product owner approved roadmap 2 decisions R1 to R6 as recommended on 2026-11-10. Decision R1 puts this phase after Phase 13. Decisions N1 to N5 follow the "Done when" column of roadmap 2.

**Goal:** A series novelist keeps the facts of a story straight with no list on paper. A Codex entry changes at a scene ("loses her left eye", "leaves the story"), and the editor and the reader panel see the entry as it is at that scene. An optional check on the device marks a name one letter away from a Codex name, and a mention of a character after that character leaves the story. A scene can have a story date, and the Series page puts the scenes of every book on one timeline. This phase builds roadmap 2's F65, F66 and F67.

**Architecture:** Each feature reuses a part that Vlo has now. A change is a list on its Codex entry, so sync, backup and the series share carry it with no new table. The reading order of the series books, then of the binder, gives each scene a place, and `entryAt` folds the changes up to a place into the entry. The continuity check is one more `blockScanPlugin`, beside the style check, and its notes show in the cursor line. A story date is one more item field, in the memoir timeline's date format.

**Tech Stack:** React, TipTap, Yjs, Dexie, Vitest, Playwright. No new runtime package.

**Spec and sources:** roadmap 2 (F65 to F67, and the risk "False continuity marks"), `docs/VLO_SPEC.md` sections 5, 9 and 12, `docs/plans/phase-9.md` (Task H5, the Codex), `docs/plans/phase-11.md` (Tasks K6 to K9: series, the style sheet, the reader panel), `docs/STATUS.md`.

**Not in this phase:** an AI continuity read (roadmap 2, "Not in this roadmap"). A change that ties to a place inside a scene. Rules beyond the two of F66. A graphic track for the series timeline: the memoir track stays the memoir's.

## Decisions for the product owner

| # | Topic | Recommendation | Other choice |
| --- | --- | --- | --- |
| N1 | Codex changes (F65) | A change has a scene, a short text and an optional "Leaves the story" box. The entry panel lists its changes in reading order, with Add, Edit and Delete. The cursor line and the reader panel show the note, then each change up to the open scene. | A full copy of the note at each scene. |
| N2 | Reading order (F65) | The binder order of a book. In a series, the books in their series order come first, so a change in book 1 holds in book 2. | Story dates (F67) as the order. |
| N3 | Continuity rules (F66) | Off by default, with one switch in the command menu, as for the style check. Rule 1, a capital word in the middle of a sentence one letter away from a Codex name or other name, runs in English projects only. Rule 2, a mention after "Leaves the story", runs in every language. | Rule 1 in every language. |
| N4 | "Not a problem" (F66) | A button in the cursor line. For rule 1 it keeps the word in the project. For rule 2 it keeps the entry in that scene. A project setting holds both lists, so sync and backups carry them. | A device setting. |
| N5 | Series timeline (F67) | "Story date" in the item menu of a scene, in the memoir date format (a year, a month or a day). The Series page gets a Timeline list: dated scenes by date, each with its book, then an Undated group in reading order. | The memoir track for the series. |
| N6 | Pull requests | Three pull requests: N-A (Tasks N1 and N2), N-B (Task N3), N-C (Tasks N4 and N5). | One pull request. |

## Global Constraints

- Everything in the Phase 0 to 13 plans' Global Constraints still holds: only `src/lib/net.ts` makes requests, Pen mode sends no AI request, WCAG 2.2 AA in each theme, each budget in spec section 12, and the Part J0 UI and motion rules of `docs/plans/phase-10.md`.
- Never lose a word. The continuity check never changes the text. Each new field gets a test for save, reload, backup, import and sync.
- Simple first. A Codex entry with no change looks as it does now. The check is off until the writer turns it on. The Timeline list shows only on a Series page.
- Nothing leaves the device for the check. The reader panel sends only the entry as it is at the scene, in the 600-token Codex budget.
- One backup version for each pull request that adds a field that the backup check reads.

## Review Focus

1. **A change in the wrong place.** Expected: `entryAt` folds only the changes before or at the scene, in binder order and in series order, and a change of a deleted scene stays in the list with "(deleted scene)" and holds nowhere. Pinned in Task N1.
2. **A reader panel request with too much.** Expected: the request holds the entry as it is at the scene and no later change. Pinned in Task N2.
3. **A false continuity mark.** Expected: rule 1 skips the first word of a sentence, a Codex name, a word of under 4 letters and a kept word. Rule 2 skips the scene of the change itself and a kept scene. Pinned in Task N3.
4. **A story date that moves a scene.** Expected: a partial date sorts by its middle, as in the memoir timeline, and two scenes with one date keep their reading order. Pinned in Task N5.

---

## Part N: Continuity (three pull requests)

### Task N1: Codex changes at a scene (F65)

**Files:** Modify `src/lib/db.ts` (`CodexEntry.changes?`), `src/features/codex/codex.ts`, `src/features/codex/CodexPage.tsx`, `src/features/backup/views.ts`, `src/features/backup/file.ts` (backup version 10), `src/features/help/help.ts`. Create `tests/unit/codex-changes.test.ts`.

**Interfaces:**

- Produces: `CodexChange { id: string; itemId: string; text: string; leaves?: true }` and `CodexEntry.changes?: CodexChange[]`.
- Produces: `readingOrder(projectId): Promise<ReadingItem[]>`, `placesOf(order): ReadonlyMap<string, number>`, `changesAt(entry, places, itemId): CodexChange[]` and `entryAt(entry, places, itemId): CodexEntry`.

- [x] Tests first: a change holds at its scene and after it, and not before it; a change in book 1 holds in book 2; a change of a deleted scene holds nowhere; changes survive save, reload, backup, a copy import (new item ids) and sync; an older backup with no changes reads.
- [x] The entry panel lists the changes, each with its scene, and adds, edits and deletes them, with Undo. Commit.
- Built: a change names its scene by item id only, because item ids are unique on every device. The reading order covers each book of the series, so a change in book 2 has a later place than each scene of book 1. A copy import keeps only the changes of its own scenes, with their new ids, because the copy is in no series. Help version 13.

### Task N2: The entry at the open scene (F65)

**Files:** Modify `src/features/codex/codexStore.ts` (the place of each scene), `src/features/editor/CursorNote.tsx`, `src/features/ai/reader.ts` (`codexContext`), `src/features/project/ProjectPage.tsx`. Extend `tests/unit/codex-changes.test.ts` and `tests/unit/reader.test.ts`.

- [x] Tests first: the cursor line on a Codex name shows the note and the changes up to the open scene; a reader panel request holds the entry at its scene and no later change, inside the Codex budget.
- [x] A browser test: a change at scene 2 shows in scene 3 and not in scene 1, and axe finds no serious issue. Commit.
- Built: `codexAt(projectId, itemId)` gives the Codex as it is at an item, and the reader panel request uses it, so `codexContext` and its 600-token budget do not change. The project screen puts the reading places in `codexStore`, and the cursor line folds the entry at its own item. A change shows as the note, then the text of each change that holds, each ending with a period.

### Task N3: The continuity check (F66)

**Files:** Create `src/features/codex/continuity.ts`, `src/features/editor/extensions/continuityCheck.ts`, `tests/unit/continuity.test.ts`, `tests/e2e/continuity.spec.ts`. Modify `src/lib/db.ts` (`Project.settings.continuity?`), `src/features/editor/writingPrefs.ts`, `src/features/editor/Editor.tsx`, `src/features/editor/CursorNote.tsx`, `src/features/editor/commands/registry.ts`, `src/features/backup/file.ts` (backup version 11), `src/styles/editor.css`, `src/features/help/help.ts`.

**Interfaces:**

- Produces: `continuityNotes(text: string, check: ContinuityInput): ContinuityNote[]`, with `ContinuityNote { from: number; to: number; rule: 'near-name' | 'left'; entryId: string }`.

- [x] Tests first: "Mria" in the middle of a sentence marks "Mira"; "Then" at the start of a sentence never marks "Thea"; a Codex name, a word of under 4 letters and a kept word never mark; a mention after "Leaves the story" marks, and the scene of the change and a kept scene do not; the text stays the same.
- [x] "Not a problem" in the cursor line keeps the word or the scene in the project settings, and the mark goes at once. A browser test turns the check on from the command menu and keeps a mark. Commit.
- Built: Continuity check is in More tools beside Style check, and in the command menu. A first word counts as the start of a sentence after an end mark, a colon, a quotation mark, a bracket or a dash. A near name must have at least 4 letters, and so must each word of a Codex name that rule 1 reads. A Codex name word with an added "s", such as "the Hales", does not mark. A mark has a double underline, so its shape differs from a style check mark. The kept marks are `settings.continuity` (backup version 11). A copy import moves each kept scene to the new entry and scene ids. The editor rescans only when the kept marks change, not when a save reads the project again. Help version 14.

### Task N4: Story dates (F67)

**Files:** Modify `src/lib/db.ts` (`Item.storyDate?`), `src/features/binder/ItemDialogs.tsx`, `src/features/binder/BinderItem.tsx`, `src/features/backup/views.ts`, `src/features/backup/file.ts` (backup version 12), `src/features/help/help.ts`. Extend `tests/unit/binder.test.ts` or create `tests/unit/story-dates.test.ts`.

- [x] Tests first: "Story date" in the item menu of a scene takes a year, a month or a day, and a wrong date gives a message; the date survives save, reload, backup, import and sync. Commit.
- Built: "Story date" sits beside Rename and Edit synopsis in the binder menu of each item with text, except a memory, which has its own date. One dialog edits the title, the synopsis or the story date. An empty date takes the date off (`setStoryDate`). The binder shows the date beside the status. Sync carries the item row whole, so the date needs no sync change. Backup version 12. A copy import copies each item row whole, so `views.ts` needs no change.

### Task N5: One timeline for a series (F67) and Gate 14

**Files:** Create `src/features/series/SeriesTimeline.tsx`, `tests/e2e/series-timeline.spec.ts`. Modify `src/features/series/series.ts`, `src/features/series/SeriesPage.tsx`, `docs/STATUS.md`.

- [x] Tests first: dated scenes of two books sort by date, with a partial date at its middle; scenes with one date keep their reading order; undated scenes follow in reading order; each row names its book and opens its scene.
- [x] A browser test of the Series page Timeline list, with axe. Commit.
- Built: `seriesTimeline` sorts the reading order of the series with `compareDates`. `inReadingOrder` is the one place that puts the items of books in reading order, for the Codex changes and the timeline. With no dated scene, the list says how to add a date and hides the undated scenes. Help version 15.
- [ ] Gate 14: run `npm run typecheck`, `lint`, `format:check`, `test`, `build`, `size` and the Chromium and phone suites. A fresh review agent reviews the Phase 14 diff against Review Focus 1 to 4. Ask the product owner to run "Run workflow" for all 4 browsers.
