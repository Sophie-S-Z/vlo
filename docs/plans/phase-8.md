# Phase 8: Match the Best Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Vlo has the standard tools that Scrivener, Novelcrafter and Google Docs users expect, and each tool stays hidden until the writer asks for it. This phase builds the roadmap's "Match the best" features (F39 to F43 and F46 to F48 in the roadmap doc) and the rest of F38. Repository Phase 7 built the roadmap's "Safe launch", so this repository phase is roadmap Phase 7.

**Architecture:** Each feature reuses a path that exists and has tests. Comments in the text are a mark in the item's Yjs document, so the save, tab sync, snapshots, backups and imports carry them with no new table. The Codex and the research files are new tables (database version 7, backup version 4). The Outline view reads the binder rows and changes them through `src/features/binder/items.ts`. Split view shows a second `EditorPane`. The style check and the Codex names are ProseMirror decorations, so they never change the text. Quick capture adds a note item through the binder functions.

**Tech Stack:** TipTap marks and decorations, Dexie, the PWA manifest of `vite-plugin-pwa` (`shortcuts`, `share_target`), JSZip, Vitest, Playwright. No new package.

**Spec and sources:** the roadmap doc ("Vlo roadmap: beat every writing app", features F38 to F48 and the design rules), `docs/VLO_SPEC.md` sections 5, 9, 12 and 15, ADR 0003 and ADR 0005, `docs/STATUS.md`, `docs/plans/phase-7.md`.

**Already done:** the Board has a List view for phones (`BoardList.tsx`). Progress has a daily goal, rest days and a 4-week calendar (`Goals.tsx`). Insights lists long sentences (`LONG_SENTENCE = 25` in `analysis/stats.ts`) and filler words (`analysis/ai/tells.ts`). Memoir has People with private names. The `note` item kind is in every template. Folder save and the walkaway export read every table of a project through `collectBackup`.

**Not in this phase:** sync, beta readers, suggestions and the Word round trip (roadmap Phase 8, waiting on the Supabase keys, decision D4). App text in other languages (decision D3). The PDF layout of right-to-left text.

## Decisions for the product owner

| # | Topic | Recommendation | Other choice |
| --- | --- | --- | --- |
| Q1 | Labels in the Outline (F40) | A project has up to 8 labels, each a name and a color that the writer makes. An item can have one label. The Outline has a Label column, and the binder shows a small dot. | No labels in this phase. The Outline shows synopsis, status and words. |
| Q2 | Comments in the text (F43) | A comment is a mark on the words that holds the comment text. The save, snapshots, backups and imports carry it with no new table. A comment goes away with its words, and Undo brings both back. Every export leaves comments out. Word comments come with the Word round trip (F45), so this phase writes no Word comment. The name "Comment" keeps it apart from footnotes and from note items in the binder. | A notes table with links to the words. A note stays when its words go, but each backup, import and restore needs new code. |
| Q3 | Codex and People (F42) | A new Codex for every project: characters, places, things and lore, each with other names and a note. People stays the memoir's private-names tool. Codex text goes in no export, share or AI request. | People becomes the memoir part of the Codex, in one list. This changes the private-name checks that Phase 3 tested. |
| Q4 | Research folder (F41) | Images, PDFs, audio and clippings (text and a link that the writer pastes) live in the project on this device. Vlo never fetches a link. Backups and "Download all my writing" include them. Vlo warns at 100 MB for each project and refuses a file over 50 MB. | Research holds only links to files on the writer's disk, so backups stay small but a file can go missing. |
| Q5 | Split view (F39) | On screens 1024 px and wider. "Open beside" on a binder item or a research file opens it in a second pane. Both texts edit, and the toolbar and the command menu act on the pane that has focus. A phone has no split view. | Split view on tablets in portrait too (768 px and wider), with narrower panes. |
| Q6 | Deadline goals (F46) | Progress gets "Finish by": a date and a word target. Vlo divides the words left by the writing days left (rest days out) each day, so a missed day spreads over the days left with no penalty. The 4-week calendar stays, and it shows the days written. | Keep only the fixed daily goal. |
| Q7 | Style check (F47) | Off by default, a switch on this device in More tools and the command menu. It underlines repeated words, filler words, cliches and sentences over 25 words. A click shows why. It never changes the text. English projects only, because the word lists are English. | The same check as a list in Insights, with no marks in the text. |
| Q8 | Quick capture (F48) | The installed app gets a "New note" home-screen action and a share target. A capture screen asks for the project (it remembers the last one) and puts a note in an "Inbox" folder at the top of the binder. Android and desktop Chrome and Edge support this. iPhone does not, so the capture screen also opens from the Library. | A separate "Inbox" project for every capture. |
| Q9 | Chinese and Japanese counts (F38, the open Phase 7 card) | When the project language is Chinese or Japanese, Vlo counts characters, and the count labels, goals and exports say "characters". Latin words in the same text count as words. | Keep word counts for every language. |

## Packages

- None. The PWA manifest already comes from `vite-plugin-pwa`.

## Global Constraints

- Everything in the Phase 0 to 7 plans' Global Constraints still holds: only `src/lib/net.ts` makes requests, Pen mode sends nothing, WCAG 2.2 AA in each theme, and each budget in spec section 12.
- Never lose a word (roadmap rule 1). Each feature that stores data gets a test for save, reload, backup and import.
- Simple first (roadmap rule 2). At the Simple tool level the Outline and Codex tabs stay hidden, and the command menu opens them at every level. Every new editor tool is in the More menu at the Simple level.
- New tables need database version 7 and backup version 4. An older build refuses a version 4 backup with its "newer version" message, so it never drops Codex or research rows in silence. Vlo still reads backup versions 1 to 3.
- The keystroke budget (50 ms p95, 18 ms now) holds with the style check, the Codex names and a split view on. Each decoration runs only on the paragraphs that a change touched.
- Initial JavaScript stays under 250 KB gzip (215 KB now). The Outline, the Codex, the research viewer and the capture screen load on use.
- No Codex text, comment text or research file goes in an AI request, a share or an export.

## Review Focus

1. **A comment or a label that a backup drops.** Expected: a backup and import of a project with comments, labels, Codex entries and research files gives the same rows and text. Pinned in Tasks H1, H3, H5 and H6.
2. **A split view that writes one item's text into the other.** Expected: two panes on two items save each text to its own item, and a reload shows both. Pinned in Task H7.
3. **A decoration that slows typing.** Expected: the keystroke test passes with the style check and the Codex names on. Pinned in Tasks H4 and H5.
4. **A memoir real name that leaves through a new path.** Expected: the private-name leak test still passes for every export and share, with Codex entries and comments in the memoir fixture. Pinned in Task H10.
5. **A capture that lands nowhere.** Expected: a shared text with no project on the device makes a project, and a capture is never lost on a failed save. Pinned in Task H8.
6. **A count change that breaks stored counts.** Expected: a Chinese project counts characters after a reload and a backup import, and an English project keeps the same counts as before. Pinned in Task H9.

---

## Part H: Match the best (four pull requests)

Pull request H-A: Tasks H1 and H2. H-B: Tasks H3 and H4. H-C: Tasks H5 to H7. H-D: Tasks H8 to H10. Each one merges alone.

### Task H1: Outline and index cards for every template (F40)

**Files:** Create `src/features/outline/OutlinePage.tsx`, `src/features/outline/outline.ts`, `src/features/outline/LabelsDialog.tsx`, `tests/unit/outline.test.ts`, `tests/e2e/outline.spec.ts`. Modify `src/lib/db.ts` (`Item.labelId?`, `Project.settings.labels?`), `src/features/backup/file.ts` (check both), `src/app/routes.tsx`, `src/features/project/ViewTabs.tsx`, `src/features/project/ProjectPage.tsx` (command), `src/features/binder/BinderItem.tsx` (label dot), `src/features/help/help.ts`.

**Interfaces:**

- Produces: `outlineRows(items: Item[], def: TemplateDef): OutlineRow[]` with `OutlineRow = { item: Item; depth: number; words: number }`, in binder order. A folder's words are the sum of its items.
- Produces: `Label = { id: string; name: string; color: string }` and `MAX_LABELS = 8`.

- [x] Tests first: rows follow the binder order and depth; a folder sums its items; an unknown `labelId` shows no label; a backup with labels passes `readBackup`, and one with a wrong label fails.
- [x] An Outline tab (Full level) with two layouts on a switch: Table (title, kind, synopsis, status, label, words) and Cards (one index card for each item of a folder, with the synopsis). Synopsis, status and label edit in place. A card drags to reorder, and the keyboard moves it too, through the binder's order functions.
- [x] Labels: "Labels…" in the Outline makes, renames, recolors and deletes labels. A deleted label leaves its items with none.
- [x] `outline.spec.ts`: edit a synopsis in the table, reorder two cards, reload, and the binder shows the same order; axe passes in each theme. Commit.

### Task H2: Deadline goals (F46)

**Files:** Modify `src/features/progress/progress.ts`, `src/features/progress/streaks.ts`, `src/features/progress/Goals.tsx`, `src/features/progress/ProgressPage.tsx`, `src/lib/db.ts` (`Project.settings.deadline?: Deadline`), `src/features/backup/file.ts`, `tests/unit/streaks.test.ts`, `tests/unit/progress.test.ts`, `tests/e2e/progress.spec.ts`.

**Interfaces:**

- Produces: `deadlineGoal(deadline, total, wordsByDay, restDays, today): { perDay: number; daysLeft: number } | null`. Pure. It returns null after the date or when the target is met.

- [x] Tests first: 10,000 words left over 10 writing days gives 1,000; a rest day is not a writing day; a missed day raises the next days evenly; the words written today count for today; the deadline day is the last writing day, also on a rest day.
- [x] "Finish by" in Progress sets the date and the target. With a deadline, the daily goal and the streak use `perDay`, and "Words a day" hides. With no deadline, the fixed goal stays as before. The 4-week calendar stays (decision Q6). Commit, then open pull request H-A.

### Task H3: Comments in the text (F43)

**Files:** Create `src/features/editor/extensions/comment.ts`, `src/features/editor/CommentList.tsx`, `src/features/editor/toolbar/panels/CommentPanel.tsx`, `tests/unit/comment.test.ts`, `tests/e2e/comment.spec.ts`. Modify `src/features/editor/Editor.tsx`, `src/features/editor/extensions/prose.ts` and `poem.ts`, `src/features/editor/docSchema.ts` (`DOC_SCHEMA` 6), `src/features/editor/commands/registry.ts` (Comment, Mod-Alt-M), `src/features/editor/toolbar/Toolbar.tsx` and `PanelHost.tsx`, `src/styles/editor.css`, `src/features/help/help.ts`.

**Interfaces:**

- Produces: the `comment` mark with `{ id: string; text: string; at: number }`. It does not grow when the writer types at its end, and two comments do not overlap. The mark has no HTML parse rule, so a copy and paste never carries a comment.

- [x] Tests first: a comment survives a reload of its Yjs state; the export reader and the plain text hold no comment text; a copy of the words takes no comment.
- [x] "Comment" on selected words opens a small field. The words get a quiet tint. The comment list under the text shows each comment in text order, and a click selects its words and opens it. Resolve removes the mark.
- [x] An older build refuses the item through `DOC_SCHEMA`, as it does for AI marks. Commit.

### Task H4: Style check on the device (F47)

**Files:** Create `src/features/editor/extensions/styleCheck.ts`, `src/features/editor/StyleReason.tsx`, `src/features/analysis/style.ts` (the filler and cliche lists), `tests/unit/style-check.test.ts`, `tests/e2e/style-check.spec.ts`. Modify `src/features/analysis/ai/tells.ts` (exports the intensifier list and the phrase pattern), `src/features/editor/writingPrefs.ts` (`styleCheck: boolean`), `src/features/editor/commands/registry.ts`, `src/features/editor/toolbar/Toolbar.tsx`, `src/features/editor/Editor.tsx`, `src/styles/editor.css`, `src/features/help/help.ts`, `tests/e2e/performance.spec.ts` (Gate 1 types with the check on).

**Interfaces:**

- Produces: `styleNotes(text: string, form: 'prose' | 'poem'): StyleNote[]` with `StyleNote = { from: number; to: number; kind: 'repeat' | 'filler' | 'cliche' | 'long' }`. Pure. It reuses `wordsOf`, `sentencesOf`, `STOP_WORDS`, `LONG_SENTENCE` and the intensifier list of `tells.ts`. A word with a capital letter, such as a name, is never a repeat.

- [x] Tests first: a word used twice within 50 words is a repeat, a stop word is not; "very" is filler; "at the end of the day" is a cliche; a 26-word sentence is long; the poem kind marks no long sentence.
- [x] The decoration runs after the save pause, only on the paragraphs that changed (a cache keyed by the paragraph node), and only in English projects. The cursor in a mark, from a click or the arrow keys, shows its reason in a live line under the toolbar. The text never changes, and the check sends nothing.
- [x] `style-check.spec.ts`: the switch is off by default, the marks show and go. Gate 1 in `performance.spec.ts` holds the keystroke budget with the check on. Commit.

### Task H5: Codex for every project (F42, F38 word list)

**Files:** Create `src/features/codex/codex.ts`, `codexStore.ts`, `CodexPage.tsx`, `CodexMatrix.tsx`, `src/features/editor/extensions/codexNames.ts`, `src/features/editor/extensions/blockScan.ts` (the paused scan that the style check and the Codex names share), `src/features/editor/CursorNote.tsx` (it was `StyleReason.tsx`), `tests/unit/codex.test.ts`, `tests/e2e/codex.spec.ts`. Modify `src/lib/db.ts` (version 7, `codex` table, a view table), `src/features/backup/file.ts`, `views.ts` and `backup.ts` (backup version 4), `src/app/routes.tsx`, `ViewTabs.tsx`, `ProjectPage.tsx`, `src/features/editor/commands/registry.ts`, `src/features/help/help.ts`, `tests/e2e/performance.spec.ts` (Gate 1 has a Codex entry).

**Interfaces:**

- Produces: `CodexEntry = { id; projectId; kind: 'character' | 'place' | 'thing' | 'lore'; name: string; aliases: string[]; note?: string; order: string }`.
- Produces: `codexMatcher(entries): (text: string) => { from: number; to: number; entryId: string }[]`. Whole words, case as the writer typed it, longest name first.
- Produces: `mentionMatrix(entries, itemTexts): Map<entryId, Map<itemId, number>>`.

- [x] Tests first: "Mira" and "Mira's" match, "Miranda" does not; an alias finds its entry; the matrix counts each item; a version 4 backup round trip keeps every entry; a version 3 backup still imports.
- [x] A Codex tab (Full level) with a list by kind and an entry panel. The matrix shows entries against the text items in binder order.
- [x] In the editor, Codex names have `spellcheck="false"`, so the browser does not mark them (the F38 word list: browsers let a page add no word to their dictionary). "Show Codex names" in More tools gives them a dotted underline, and a click shows the entry.
- [x] `codex.spec.ts`: add an entry, see its name marked in a scene, open the matrix. The backup round trip is in `codex.test.ts` and `views-data.test.ts`. Commit.

### Task H6: Research folder (F41)

**Files:** Create `src/features/research/research.ts`, `ResearchList.tsx`, `ResearchView.tsx`, `tests/unit/research.test.ts`, `tests/e2e/research.spec.ts`. Modify `src/lib/db.ts` (`research` table in version 7), `src/features/backup/file.ts` (`research/<id>` files) and `backup.ts`, `src/features/library/projects.ts` (a project delete removes its research), `src/features/export/walkaway.ts`, `src/features/binder/Binder.tsx` (a slot for the Research section), `src/features/project/ProjectPage.tsx` (`research=<id>` in the address opens the view), `vercel.json` (`frame-src 'self' blob:` for the PDF view), `src/features/help/help.ts`, `tests/unit/setup.ts` (Node's Blob, which fake-indexeddb keeps).

**Interfaces:**

- Produces: `ResearchFile = { id; projectId; name: string; type: string; size: number; addedAt: number; data?: Blob; clip?: { url?: string; text: string } }`. A Blob, so a list of the files reads no bytes. `MAX_RESEARCH_FILE = 50 MB`, `RESEARCH_WARN = 100 MB`.

- [x] Tests first: a file over 50 MB is refused; the project total over 100 MB gives the warning; a backup round trip keeps each file byte for byte; a clipping link stays text and is never fetched.
- [x] A Research section at the end of the binder: Add files, Add clipping. An image, a PDF, an audio file or a clipping opens in the research view, which renames, deletes with confirm, and offers the download of each file.
- [x] "Download all my writing" puts the files in a Research folder of each project. Commit.

### Task H7: Split view (F39)

**Files:** Create `src/features/project/SplitPane.tsx`, `tests/e2e/split-view.spec.ts`. Modify `src/features/project/ProjectPage.tsx` (`beside` in the address), `src/features/binder/Binder.tsx` and `BinderItem.tsx` (Open beside; the item menu scrolls on a short screen), `src/features/research/ResearchList.tsx`, `src/features/editor/Editor.tsx`, `EditorPane.tsx` and `commands/editorBus.ts` (the active editor and the Craft switch follow focus), `src/features/help/help.ts`, `tests/e2e/performance.spec.ts`, `tests/e2e/research.spec.ts`.

- [x] Open beside: a text item or a research file opens in a right pane at 1024 px and wider. The item that is open on the left cannot open beside. Swap panes and Close pane are on the pane. The address keeps `beside=<id>`, so a reload keeps the split. Focus mode shows only the left pane.
- [x] Both panes edit and save to their own items (Review Focus 2). The toolbar, the command menu, the Assistant, the details and the Craft switch act on the pane whose text has focus. A pane that opens beside waits for focus. Only the left pane shows the scene and its sound.
- [x] `split-view.spec.ts`: type in both panes, a command menu format acts on the focused pane, reload, and each item has its own text; Swap and Close. `performance.spec.ts`: the keystroke budget holds in the 10,000-word scene with a pane open beside it.

### Task H8: Quick capture (F48)

**Files:** Create `src/features/capture/CapturePage.tsx`, `src/features/capture/capture.ts`, `tests/unit/capture.test.ts`, `tests/e2e/capture.spec.ts`. Modify `vite.config.ts` (manifest `shortcuts` and `share_target`), `src/app/routes.tsx`, `src/features/library/LibraryPage.tsx`, `src/features/import/tree.ts` (exports `editorSchemas`), `src/features/help/help.ts`.

**Interfaces:**

- Produces: `captureNote(projectId | null, { title?: string; text: string }): Promise<{ projectId; itemId }>`. It writes the note's text, then finds or makes the top "Inbox" folder and adds the note item in one transaction. With no project, it makes an Open writing project. `sharedText(text, url)` puts the link on a line of its own.

- [x] Tests first: the first capture makes the Inbox, the second uses it; the text keeps its line breaks; a link is a line of text; a device with no project gets a new Open writing project.
- [x] `/capture?title=&text=&url=` shows the text in a field, a project picker and Save note. A failed save keeps the text on the screen with the message. The Library has Quick note.
- [x] `capture.spec.ts`: open the share URL, save, and the note is in the Inbox after a reload; the manifest names the shortcut and the share target.

### Task H9: Chinese and Japanese counts (F38)

**Files:** Modify `src/lib/wordcount.ts`, `src/features/editor/itemText.ts`, `EditorPane.tsx`, `WordCount.tsx`, `manuscript.ts` (the language in the context), `format/notes.ts` (`withoutNotes` also takes a poem's notes off), `stats/stats.ts`, `stats/WritingStats.tsx`, `src/features/library/format.ts` (`formatWords` takes the unit), `projects.ts` (a language change counts again, and today's count keeps its place), `src/lib/db.ts` (version 8 counts older Chinese and Japanese projects again), `src/features/backup/backup.ts` (so does an import), `stats/dayStart.ts`, `ProjectCard.tsx`, `src/features/project/ProjectPage.tsx`, `src/features/focus/SessionTimer.tsx`, `src/features/progress/ProgressPage.tsx`, `Goals.tsx`, `Tiles.tsx`, `src/features/outline/OutlinePage.tsx`, `src/features/sequences/SequenceList.tsx`, `SequencesPage.tsx`, `src/features/snapshots/HistoryPanel.tsx`, `src/features/analysis/StatsBar.tsx`, `stats.ts`, `analysis.worker.ts`, `analysisClient.ts`, `src/features/export/manuscript.ts`, `docx.ts`, `pdf/pdf.ts`, `src/features/capture/capture.ts`, `tests/unit/wordcount.test.ts`, `item-text.test.ts`, `manuscript.test.ts`, and create `tests/e2e/cjk.spec.ts`.

**Interfaces:**

- Produces: `countUnit(language: string | undefined): 'words' | 'characters'` and `countWords(text, language?)`, which counts each Han and kana character as one unit for `zh` and `ja`, and each word in another script as one.

- [x] Tests first: "我爱写作" is 4 characters; "東京へ行く" is 5; mixed "Vlo は便利" is 1 word and 3 characters, so 4 units; English text gives the same count as before.
- [x] The stored `wordCount` holds the unit count. A change of language counts the items again from their text copies, without their notes. The count labels, the session, goal and progress counts, History, the stats bar and the manuscript first page say "characters" for these projects. Insights keeps its word statistics, because its measures read English words.
- [x] Database version 8 and a backup import count the items of older Chinese and Japanese projects again.
- [x] `cjk.spec.ts`: a scene counts words, then 5 characters after the change to Japanese, after a reload and on the Library card.

### Task H10: Gate 8 and the release

- [x] Update STATUS, the help page and `docs/licenses.md`. Run `npm run typecheck`, `lint`, `format:check`, `test`, `build`, `size` and the Chromium and phone suites. Expected: PASS. The phone suite runs in CI.
- [x] Add Codex entries and notes to the memoir leak test (Review Focus 4).
- [x] A fresh review agent that has not seen the implementation reviews the Phase 8 diff against Review Focus 1 to 6. Fix each high finding.
- [ ] Open pull request H-D. Ask you to run "Run workflow" for all 4 browsers.
