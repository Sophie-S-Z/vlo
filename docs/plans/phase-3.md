# Phase 3: Template Views Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Each template gets the views that its writers plan with. A novelist plans on a Story Board and a Plot Grid and jumps from a card to its scene. A memoirist places memories on a life track, regroups them by theme, and keeps real names private in every export. A poet keeps many named orders of the same poems and turns on syllable, stress and rhyme labels. Every writer logs submissions and sees progress.

**Architecture:** Dexie version 3 adds the tables of spec section 5 that Phase 3 needs: `cards`, `threads`, `cardLinks`, `lifeStages`, `sequences`, `people` and `submissions`. Each view is its own lazy route under `/p/:projectId/…`, so the Library and the editor chunks do not grow. The backup file carries the new tables. Every export already passes through `lib/privacy.ts` (`shareSafe`), so private names plug into one place. The Craft panel runs in a Web Worker and loads the CMU dictionary only when the poet turns the panel on.

**Spec:** `docs/VLO_SPEC.md` sections 3 (F14 to F21, US05 to US08), 5, 8, 12, 13, 14 (Phase 3), 15 (memoir and novel fixtures).

**Already done:** Ambient sound (F22, Phase 3 task 8) moved to Phase 2 and shipped there. F14 for the Library card is done in Phase 1. Phase 3 adds the board card to scene transition.

## Decisions (product owner approved all, 2026-11-05)

| # | Topic | Recommendation | Other choice |
| --- | --- | --- | --- |
| D1 | Motion library | No GSAP. Drag, pan and pinch use `@use-gesture/react` (MIT). Inertia is a small decay function of about 40 lines. Board to grid, time to theme and the ring use the View Transitions API with a FLIP fallback through the Web Animations API. This keeps the Phase 1 decision. | GSAP 3.15 with Flip, Draggable and InertiaPlugin, as spec section 6 says. GSAP is free, but its "Standard no charge" license is not an open source license, and it adds about 45 KB gzip to the board chunk. |
| D2 | CMU dictionary (Craft panel) | Load the dictionary (about 1 MB gzip) only when the poet turns on the Craft panel. Keep it out of the install precache. The service worker caches it on first use, so it works offline after that. | Precache it with the app. The install grows from about 0.6 MB to about 1.6 MB for every writer. |
| D3 | Where a marked name lives | A `person` mark in the item's Yjs text, with the person id. The mark moves with the text when the writer edits around it. | Ranges in Dexie. Each edit would need a range fix, and a second tab could break it. |
| D4 | Board scope | One board per novel project. A card can link to one binder item. "Cards from scenes" (E1) makes one card per scene. | One board per part or chapter. |
| D5 | Navigation to the views | A tab row in the project header: Write, then the views of the template (Board and Plot Grid for a novel, Timeline and People for a memoir, Sequences for poetry), then Submissions and Progress for every template. | Only the command menu and the binder menu open the views. |

## Extra features (approved 2026-11-05)

| # | Feature | What it does |
| --- | --- | --- |
| E1 | Cards from scenes | One click makes a board card for each scene that has no card, with the scene title and synopsis. |
| E2 | Export a sequence | Export a named order as a chapbook in every format, with the poems in that order. |
| E3 | Undated shelf | Memories with no date sit on a shelf under the timeline. The writer drags one onto the track to give it a date. |
| E4 | Submission follow-up | A row turns to the accent color when a "Sent" piece has no reply after the days the writer sets for that venue (default 90). |
| E5 | Name check before export | The export dialog lists each unmarked real name that it found, with a count and a "Mark all" button, before the file is made. |

## Packages (approved 2026-11-05)

| Package | License | Ships to browser | Reason |
| --- | --- | --- | --- |
| @use-gesture/react | MIT | yes, board and timeline chunks | Pan, pinch, drag and wheel (spec section 6) |
| cmu-pronouncing-dictionary | ISC | yes, lazy in the Craft worker only | Syllables, stress and rhyme (spec section 6) |
| syllable | MIT | yes, lazy in the Craft worker only | Syllables for words that are not in the dictionary (spec section 6) |

`@dnd-kit/core` and `@dnd-kit/sortable` are already installed (Phase 1 binder). With D1 as recommended, GSAP, `@gsap/react` and `motion` are not added. STATUS records that change under rule 11.

## Global Constraints

- Everything in the Phase 0, 1 and 2 plans' Global Constraints still holds.
- The initial JavaScript stays under 250 KB gzip. Each view is a lazy route. The board, timeline and sequencer chunks each stay under 60 KB gzip.
- Every view works by keyboard and with a screen reader. The board and the timeline each have a List view with the same data. axe finds zero serious issues on every new route.
- Touch: pan and pinch work on the board and the timeline at 390 px width. Tap targets are at least 44 px.
- Calm mode and reduced motion: views switch with no movement, and the ring preview shows a still list.
- Private names never leave the device in real form when the share-safe switch is on: not in an export, a backup made for sharing, or (in Phase 4) an AI request.
- Each Dexie change has a schema version and an upgrade test. A backup from Phase 2 still imports.

## Review Focus

1. **A name inside another word or another name.** Expected: "Rosa" never matches "Rosalind", and "Aunt Rosa" wins over "Rosa". Pinned in Task C5.
2. **A marked name that the writer edits.** Expected: typing inside a marked name keeps the mark on the whole name, and a split name loses its mark with a warning in the export check. Pinned in Task C5.
3. **Pinch zoom on a phone with 200 cards.** Expected: 60 fps on local Chromium with CPU slowdown x4, and no text selection during the gesture. Pinned in Task C2.
4. **Two orders of the same poems.** Expected: a move in one order never changes another order (US08). A deleted poem leaves every order without a gap. Pinned in Task C6.
5. **A memory with a partial date ("1994" or "1994-07").** Expected: it sits at the middle of its year or month, and a drag gives it a full date only if the writer drops it at day scale. Pinned in Task C4.
6. **The Craft worker on a 300-line poem.** Expected: labels arrive within 200 ms after a typing pause, and typing never waits for the worker. Pinned in Task C7.

---

## Part C: Template views (pull requests C1 to C5)

### Task C1: Data model version 3 and backup format version 2 (pull request C1)

**Files:** Modify `src/lib/db.ts`, `src/features/library/projects.ts` (`deleteProject`), `src/features/binder/items.ts` (`deleteItem`), `src/features/backup/file.ts`, `backup.ts`. Create `src/features/backup/check.ts` (the row checks, moved out of `file.ts`) and `views.ts`.

- [x] Dexie version 3: `cards: 'id, projectId, itemId'`, `threads: 'id, projectId'`, `cardLinks: 'id, projectId, fromCardId, toCardId'`, `lifeStages: 'id, projectId'`, `sequences: 'id, projectId'`, `people: 'id, projectId'`, `submissions: 'id, projectId'`. Types as spec section 5. Upgrade test from version 2 with real rows.
- [x] Backup version 2: `project.json` gains the new rows. Import reads version 1 and version 2. Each reference must point to a row of the file. Copy mode gives new ids and remaps every reference (card item, link ends, thread, sequence items, submission items, life stage of each memory). Task C5 adds the remap of person marks in the text, with the marks.
- [x] `deleteProject` and import Replace remove the new rows. `deleteItem` unlinks the item's cards and drops it from each poem order. A submission keeps the id, so the tracker can show "Deleted piece".
- [x] Tests: upgrade, round trip with every new table, copy remap, a version 1 file imports, delete rules, damaged references.

The view tabs (D5) arrive with the first view in Task C2, because a tab with no screen is a placeholder (section 0, rule 8).

### Task C2: Story Board (F15, F14) (pull request C2)

**Files:** Create `src/features/board/` (`BoardPage.tsx`, `Canvas.tsx`, `CardView.tsx`, `Threads.tsx`, `inertia.ts`, `boardStore.ts`, `BoardList.tsx`) and `src/features/project/ViewTabs.tsx`. Modify `src/app/routes.tsx`.

- [x] View tabs (D5). Each view is a lazy route with a document title and an `h1`. Each later task adds its own tab.
- [x] Canvas: DOM cards with CSS transforms. Pan by drag on empty space or two fingers, zoom by wheel or pinch around the pointer, 10 % to 400 %. Zoom buttons and a "Fit all" button.
- [x] Cards: add, edit title and note, color, delete with undo. Drag with inertia (D1) and an 8 px snap. Arrow keys move a focused card by 8 px (Shift: 64 px).
- [x] Threads: create, name, color, order. Link two cards with a thread (drag from a card's handle, or a "Link to…" menu for keyboard users). SVG curves redraw on each move frame.
- [x] Link a card to a binder item. E1 "Cards from scenes".
- [x] Double-click (or Enter) on a linked card: the view zooms to the card, then a view transition grows the card into the scene editor (F14). The scene opens in under 1 s (US05).
- [x] List view (spec 8.1): the same cards in a sortable table by thread, linked item or title. Every action of the canvas is in this view too.
- [x] Tests: unit tests for snap, inertia decay, zoom math and the thread path. Playwright: US05 timing, keyboard move, link by menu, touch pan and pinch at 390 px (Review Focus 3), Calm mode, axe on canvas and list.

### Task C3: Plot Grid (pull request C2)

- [x] Rows are chapters (binder order), columns are threads. A cell holds the cards on that thread whose linked scene is in that chapter. A card with no thread sits in "No thread".
- [x] Moving a card between cells changes its thread or the parent chapter of its scene, after a confirm for a chapter change.
- [x] The board to grid switch animates the cards to their cells (D1). Calm mode switches at once.
- [x] Tests: the novel fixture (3 chapters, 2 threads, 6 cards) gives the right cells; a cell move changes the thread; axe.

### Task C4: Memory Timeline (F16) (pull request C3)

**Files:** Create `src/features/timeline/` (`TimelinePage.tsx`, `Track.tsx`, `LifeStages.tsx`, `dates.ts`, `ThemeColumns.tsx`).

- [x] `dates.ts`: parse `YYYY`, `YYYY-MM` and `YYYY-MM-DD`, place partial dates at the middle of their span (Review Focus 5), and map dates to x at year, month and day scale.
- [x] Track: life stages as colored bands with names, memories as cards placed by date, stacked when they overlap. Vertical wheel moves the track sideways. Pinch and Ctrl-wheel change the scale.
- [x] Drag a memory to a new date. Keyboard: Left and Right move a focused memory by one unit of the current scale.
- [x] Life stages: add, rename, color, set start and end, reorder.
- [x] "By time / By theme" toggle: theme columns hold each memory once per theme, and "No theme" holds the rest. The card count text stays the same (US07).
- [x] E3 Undated shelf.
- [x] A List view with the same data, sorted by date.
- [x] Tests: date unit tests; US07; drag changes the date; touch at 390 px; axe.

### Task C5: People and private names (F17) (pull request C3)

**Files:** Create `src/features/people/` (`PeoplePage.tsx`, `PersonForm.tsx`, `personMark.ts`, `markAll.ts`, `aliasPreview.ts`). Modify `src/lib/privacy.ts`, the export dialog.

- [x] People route: add a person with a label and name variants, each with an alias ("Aunt Rosa" to "Aunt Maria", "Rosa" to "Maria").
- [x] Mark `person` with `personId` (D3) in prose and poems. "Mark as person" in the selection menu and the command menu. "Mark all" marks every exact whole-word match of each variant in the project (Review Focus 1).
- [x] "Show aliases" switch: a decoration shows each alias in place of the marked text and each unmarked match, and the text does not change.
- [x] `shareSafe` replaces marked ranges by the alias of the matching variant, then unmarked exact matches, longest variant first. It returns the list of unmarked names for E5.
- [x] Leak test: the memoir fixture exported to Markdown, DOCX, EPUB, PDF and the manuscript format contains "Rosa" and "Teo" 0 times (US06). The test reads each file back as text.
- [x] Tests: mark survives edits, reload and snapshot restore (Review Focus 2); poem spaces stay exact around a marked name; axe.

### Task C6: Collection Sequencer (F18) (pull request C4)

**Files:** Create `src/features/sequences/` (`SequencesPage.tsx`, `SequenceList.tsx`, `Ring.tsx`).

- [ ] Poems show as cards. Create, rename, copy and delete named orders. A new order starts with the binder order.
- [ ] Reorder with dnd-kit sortable and a spring on drop. Keyboard reorder with the Phase 1 binder pattern.
- [ ] Ring preview of the current order: a 3D ring with the poem titles, turned by drag, wheel or arrow keys. Calm mode and reduced motion show a still numbered list.
- [ ] A new poem joins the end of each order. A deleted poem leaves each order (Review Focus 4).
- [ ] E2 Export a sequence.
- [ ] Tests: US08; delete and add; keyboard reorder; axe.

### Task C7: Craft panel (F19) (pull request C4)

**Files:** Create `src/features/craft/` (`craft.worker.ts`, `scan.ts`, `CraftLabels.tsx`).

- [ ] `scan.ts` (pure, unit tested): words to CMU phones; syllable count per line with the `syllable` fallback; stress marks from CMU stress digits (˘ and /); rhyme letters, where two lines rhyme when their phones match from the last stressed vowel to the end.
- [ ] Worker: loads the dictionary on first use (D2), scans after each typing pause, and answers with labels per line.
- [ ] Labels: syllable count at each line end, stress marks above syllables, rhyme letters at line ends. They sit in an overlay outside ProseMirror and fade in with a short stagger. A switch per poem, off by default.
- [ ] Tests: scan unit tests on known lines ("Shall I compare thee to a summer's day" gives 10 syllables and the iambic stress); worker timing (Review Focus 6); the poem text never changes; axe.

### Task C8: Submissions tracker (F20) (pull request C5)

**Files:** Create `src/features/submissions/` (`SubmissionsPage.tsx`, `SubmissionForm.tsx`).

- [ ] A sortable table: pieces (one or more items), venue, sent date, status, reply date, notes. Sort by each column. A status change animates the row color.
- [ ] Add, edit and delete with undo. E4 follow-up days per venue.
- [ ] Tests: sort, status change, a deleted item shows as "Deleted piece"; axe.

### Task C9: Progress map, goals and streaks (F21) (pull request C5)

**Files:** Create `src/features/progress/` (`ProgressPage.tsx`, `Tiles.tsx`, `streaks.ts`).

- [ ] One tile per item, colored by status, in binder order. Tiles enter with a mosaic stagger from the center. A tile opens its item.
- [ ] Total words and session counts with counting numbers.
- [ ] Goals and streaks are off by default. A daily word goal. Rest days keep a streak (`streaks.ts`, pure and unit tested across time zones and daylight saving changes).
- [ ] Tests: streak rules; tiles match items; Calm mode shows no stagger; axe.

**Gate 3:** US05, US06, US07 and US08 pass. The private-name leak test passes for every export format. Touch pan and pinch work on the board at 390 px width. axe passes on every new route. Keystroke and open budgets still pass.
