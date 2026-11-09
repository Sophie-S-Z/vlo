# Phase 8: Match the Best Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Vlo has the standard tools that Scrivener, Novelcrafter and Google Docs users expect, and each tool stays hidden until the writer asks for it. This phase builds the roadmap's "Match the best" features (F39 to F43 and F46 to F48 in the roadmap doc) and the rest of F38. Repository Phase 7 built the roadmap's "Safe launch", so this repository phase is roadmap Phase 7.

**Architecture:** Each feature reuses a path that exists and has tests. Notes in the text are a mark in the item's Yjs document, so the save, tab sync, snapshots, backups and imports carry them with no new table. The Codex and the research files are new tables (database version 7, backup version 4). The Outline view reads the binder rows and changes them through `src/features/binder/items.ts`. Split view shows a second `EditorPane`. The style check and the Codex names are ProseMirror decorations, so they never change the text. Quick capture adds a note item through the binder functions.

**Tech Stack:** TipTap marks and decorations, Dexie, the PWA manifest of `vite-plugin-pwa` (`shortcuts`, `share_target`), JSZip, Vitest, Playwright. No new package.

**Spec and sources:** the roadmap doc ("Vlo roadmap: beat every writing app", features F38 to F48 and the design rules), `docs/VLO_SPEC.md` sections 5, 9, 12 and 15, ADR 0003 and ADR 0005, `docs/STATUS.md`, `docs/plans/phase-7.md`.

**Already done:** the Board has a List view for phones (`BoardList.tsx`). Progress has a daily goal, rest days and a 4-week calendar (`Goals.tsx`). Insights lists long sentences (`LONG_SENTENCE = 25` in `analysis/stats.ts`) and filler words (`analysis/ai/tells.ts`). Memoir has People with private names. The `note` item kind is in every template. Folder save and the walkaway export read every table of a project through `collectBackup`.

**Not in this phase:** sync, beta readers, suggestions and the Word round trip (roadmap Phase 8, waiting on the Supabase keys, decision D4). App text in other languages (decision D3). The PDF layout of right-to-left text.

## Decisions for the product owner

| # | Topic | Recommendation | Other choice |
| --- | --- | --- | --- |
| Q1 | Labels in the Outline (F40) | A project has up to 8 labels, each a name and a color that the writer makes. An item can have one label. The Outline has a Label column, and the binder shows a small dot. | No labels in this phase. The Outline shows synopsis, status and words. |
| Q2 | Notes in the text (F43) | A note is a mark on the words that holds the note text. The save, snapshots, backups and imports carry it with no new table. A note goes away with its words, and Undo brings both back. Word export can add the notes as Word comments; the other formats leave them out. | A notes table with links to the words. A note stays when its words go, but each backup, import and restore needs new code. |
| Q3 | Codex and People (F42) | A new Codex for every project: characters, places, things and lore, each with other names and a note. People stays the memoir's private-names tool. Codex text goes in no export, share or AI request. | People becomes the memoir part of the Codex, in one list. This changes the private-name checks that Phase 3 tested. |
| Q4 | Research folder (F41) | Images, PDFs, audio and clippings (text and a link that the writer pastes) live in the project on this device. Vlo never fetches a link. Backups and "Download all my writing" include them. Vlo warns at 100 MB for each project and refuses a file over 50 MB. | Research holds only links to files on the writer's disk, so backups stay small but a file can go missing. |
| Q5 | Split view (F39) | On screens 1024 px and wider. "Open beside" on a binder item or a research file opens it in a second pane. Both texts edit, and the toolbar and the command menu act on the pane that has focus. A phone has no split view. | Split view on tablets in portrait too (768 px and wider), with narrower panes. |
| Q6 | Deadline goals (F46) | Progress gets "Finish by": a date and a word target. Vlo divides the words left by the writing days left (rest days out) each day, so a missed day spreads over the days left with no penalty. The 4-week calendar becomes a month calendar with the deadline on it. | Keep only the fixed daily goal, and add the month calendar. |
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
- No Codex text, note text or research file goes in an AI request, a share or an export, except notes as Word comments when the writer asks.

## Review Focus

1. **A note or a label that a backup drops.** Expected: a backup and import of a project with notes, labels, Codex entries and research files gives the same rows and text. Pinned in Tasks H1, H3, H5 and H6.
2. **A split view that writes one item's text into the other.** Expected: two panes on two items save each text to its own item, and a reload shows both. Pinned in Task H7.
3. **A decoration that slows typing.** Expected: the keystroke test passes with the style check and the Codex names on. Pinned in Tasks H4 and H5.
4. **A memoir real name that leaves through a new path.** Expected: the private-name leak test still passes for every export and share, with Codex entries and notes in the memoir fixture. Pinned in Task H10.
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

- [ ] Tests first: rows follow the binder order and depth; a folder sums its items; an unknown `labelId` shows no label; a backup with labels passes `readBackup`, and one with a wrong label fails.
- [ ] An Outline tab (Full level) with two layouts on a switch: Table (title, kind, synopsis, status, label, words) and Cards (one index card for each item of a folder, with the synopsis). Synopsis, status and label edit in place. A card drags to reorder, and the keyboard moves it too, through the binder's order functions.
- [ ] Labels: "Labels…" in the Outline makes, renames, recolors and deletes labels. A deleted label leaves its items with none.
- [ ] `outline.spec.ts`: edit a synopsis in the table, reorder two cards, reload, and the binder shows the same order; axe passes in each theme. Commit.

### Task H2: Deadline goals and a month calendar (F46)

**Files:** Modify `src/features/progress/progress.ts`, `src/features/progress/streaks.ts`, `src/features/progress/Goals.tsx`, `src/lib/db.ts` (`Project.settings.deadline?: { date: string; words: number }`), `src/features/backup/file.ts`, `src/features/editor/stats/WritingStats.tsx`. Modify `tests/unit/progress.test.ts` (or create it), `tests/e2e/progress.spec.ts`.

**Interfaces:**

- Produces: `deadlineGoal(input: { deadline; total: number; today: string; restDays: number[]; wordsByDay }): { perDay: number; daysLeft: number } | null`. Pure. It returns null after the date or when the target is met.

- [ ] Tests first: 10,000 words left over 10 writing days gives 1,000; a rest day is not a writing day; a missed day raises the next days evenly; the words written today count for today; the deadline day is the last writing day.
- [ ] "Finish by" in Progress sets the date and the target. With a deadline, the daily goal and the stats line use `perDay`. With no deadline, the fixed goal stays as now.
- [ ] The calendar shows the current month, Monday first, with the deadline day marked and arrows for other months. Each day keeps its met, rest and missed state for screen readers. Commit, then open pull request H-A.

### Task H3: Notes in the text (F43)

**Files:** Create `src/features/editor/extensions/textNote.ts`, `src/features/editor/NoteList.tsx`, `tests/unit/text-note.test.ts`, `tests/e2e/text-note.spec.ts`. Modify `src/features/editor/Editor.tsx`, `src/features/editor/docSchema.ts` (`DOC_SCHEMA` 6), `src/features/editor/commands/registry.ts` (Add note, Mod-Alt-M), `src/features/export/read.ts` and `docx.ts` (Word comments), `src/features/export/ExportDialog.tsx`, `src/features/help/help.ts`.

**Interfaces:**

- Produces: the `textNote` mark with `{ id: string; text: string; at: number }`. It does not grow when the writer types at its end, and two notes do not overlap.

- [ ] Tests first: a note survives save, reload, snapshot restore, backup and import; plain text, Markdown, EPUB, PDF and the share bundle hold no note text; DOCX with "Include notes" has one Word comment for each note on the same words.
- [ ] "Add note" on selected words opens a small field. The words get a quiet underline. The item's note list (beside the footnote list) shows each note in text order, and a click goes to its words. Edit and Resolve are on each note; Resolve removes the mark.
- [ ] An older build refuses the item through `DOC_SCHEMA`, as it does for AI marks. Commit.

### Task H4: Style check on the device (F47)

**Files:** Create `src/features/editor/extensions/styleCheck.ts`, `src/features/analysis/style.ts` (the cliche list), `tests/unit/style-check.test.ts`, `tests/e2e/style-check.spec.ts`. Modify `src/features/editor/writingPrefs.ts` (`styleCheck: boolean`), `src/features/editor/commands/registry.ts`, `src/features/editor/Editor.tsx`, `src/features/help/help.ts`.

**Interfaces:**

- Produces: `styleNotes(text: string): StyleNote[]` with `StyleNote = { from: number; to: number; kind: 'repeat' | 'filler' | 'cliche' | 'long' }`. Pure. It reuses `wordsOf`, `sentencesOf`, `STOP_WORDS`, `LONG_SENTENCE` and the intensifier list of `tells.ts`.

- [ ] Tests first: a word used twice within 50 words is a repeat, a stop word is not; "very" is filler; "at the end of the day" is a cliche; a 26-word sentence is long; the poem kind marks no long sentence.
- [ ] The decoration runs after the save pause, only on the paragraphs that changed, and only in English projects. A click or a keyboard focus on a mark shows its reason. The text never changes, and the check sends nothing.
- [ ] `style-check.spec.ts`: the switch is off by default, the marks show and go, and the keystroke budget holds with the check on. Commit, then open pull request H-B.

### Task H5: Codex for every project (F42, F38 word list)

**Files:** Create `src/features/codex/codex.ts`, `CodexPage.tsx`, `CodexMatrix.tsx`, `src/features/editor/extensions/codexNames.ts`, `tests/unit/codex.test.ts`, `tests/e2e/codex.spec.ts`. Modify `src/lib/db.ts` (version 7, `codex` table), `src/features/backup/file.ts` and `views.ts` (backup version 4), `src/app/routes.tsx`, `ViewTabs.tsx`, `ProjectPage.tsx`, `src/features/help/help.ts`.

**Interfaces:**

- Produces: `CodexEntry = { id; projectId; kind: 'character' | 'place' | 'thing' | 'lore'; name: string; aliases: string[]; note?: string; order: string }`.
- Produces: `codexMatcher(entries): (text: string) => { from: number; to: number; entryId: string }[]`. Whole words, case as the writer typed it, longest name first.
- Produces: `mentionMatrix(entries, itemTexts): Map<entryId, Map<itemId, number>>`.

- [ ] Tests first: "Mira" and "Mira's" match, "Miranda" does not; an alias finds its entry; the matrix counts each item; a version 4 backup round trip keeps every entry; a version 3 backup still imports.
- [ ] A Codex tab (Full level) with a list by kind and an entry panel. The matrix shows entries against the text items in binder order.
- [ ] In the editor, Codex names have `spellcheck="false"`, so the browser does not mark them (the F38 word list: browsers let a page add no word to their dictionary). "Show Codex names" in More tools gives them a dotted underline, and a click shows the entry.
- [ ] `codex.spec.ts`: add an entry, see its name marked in a scene, open the matrix, back up and import. Commit.

### Task H6: Research folder (F41)

**Files:** Create `src/features/research/research.ts`, `ResearchList.tsx`, `ResearchView.tsx`, `tests/unit/research.test.ts`, `tests/e2e/research.spec.ts`. Modify `src/lib/db.ts` (`research` table in version 7), `src/features/backup/file.ts` (`research/<id>` files), `src/features/export/walkaway.ts`, `src/features/binder/Binder.tsx`, `vercel.json` (`frame-src 'self' blob:` for the PDF view), `src/features/help/help.ts`.

**Interfaces:**

- Produces: `ResearchFile = { id; projectId; name: string; type: string; size: number; addedAt: number; data?: ArrayBuffer; clip?: { url?: string; text: string } }`. `MAX_RESEARCH_FILE = 50 MB`, `RESEARCH_WARN = 100 MB`.

- [ ] Tests first: a file over 50 MB is refused; the project total over 100 MB gives the warning; a backup round trip keeps each file byte for byte; a clipping link stays text and is never fetched.
- [ ] A Research section at the end of the binder: Add files, Add clipping, rename, delete with confirm. An image, a PDF, an audio file or a clipping opens in the research view.
- [ ] "Download all my writing" puts the files in a Research folder of each project. Commit.

### Task H7: Split view (F39)

**Files:** Create `src/features/project/SplitPane.tsx`, `tests/e2e/split-view.spec.ts`. Modify `src/features/project/ProjectPage.tsx` (`beside` in the address), `ProjectLayout.tsx`, `src/features/binder/BinderItem.tsx` (Open beside), `src/features/research/ResearchList.tsx`, `src/features/editor/commands/editorBus.ts` (the active editor follows focus).

- [ ] Open beside: a text item or a research file opens in a right pane at 1024 px and wider. The item that is open on the left cannot open beside. Close and Swap are on the pane. The address keeps `beside=<id>`, so a reload keeps the split.
- [ ] Both panes edit and save to their own items (Review Focus 2). The toolbar, the command menu and the Assistant act on the pane that has focus. Only the left pane shows the scene.
- [ ] `split-view.spec.ts`: type in both panes, reload, and each item has its own text; the keystroke budget holds with two panes. Commit, then open pull request H-C.

### Task H8: Quick capture (F48)

**Files:** Create `src/features/capture/CapturePage.tsx`, `src/features/capture/capture.ts`, `tests/unit/capture.test.ts`, `tests/e2e/capture.spec.ts`. Modify `vite.config.ts` (manifest `shortcuts` and `share_target`), `src/app/routes.tsx`, `src/features/library/LibraryPage.tsx`, `src/features/help/help.ts`.

**Interfaces:**

- Produces: `captureNote(projectId, { title?: string; text: string; url?: string }): Promise<string>`. It finds or makes the top "Inbox" folder and adds a note item with the text, in one transaction.

- [ ] Tests first: the first capture makes the Inbox, the second uses it; the text keeps its line breaks; a link is a line of text; a device with no project gets a new Open writing project.
- [ ] `/capture?title=&text=&url=` shows the text in a field, a project picker and Save. A failed save keeps the text on the screen with the message.
- [ ] `capture.spec.ts`: open the share URL, save, and the note is in the Inbox after a reload. Commit.

### Task H9: Chinese and Japanese counts (F38)

**Files:** Modify `src/lib/wordcount.ts`, `src/features/editor/itemText.ts`, `src/features/library/format.ts` (`formatWords` takes the unit), each count label that `grep -rn "formatWords\|words" src` finds, `src/features/export/build.ts`, `tests/unit/wordcount.test.ts`, `tests/e2e/rtl.spec.ts` or a new `tests/e2e/cjk.spec.ts`.

**Interfaces:**

- Produces: `countUnit(language: string | undefined): 'words' | 'characters'` and `countWords(text, language?)`, which counts each Han and kana character as one unit for `zh` and `ja`.

- [ ] Tests first: "我爱写作" is 4 characters; "東京へ行く" is 5; mixed "Vlo は便利" is 1 word and 3 characters, so 4 units; English text gives the same count as before.
- [ ] The stored `wordCount` holds the unit count. A change of language counts the items again. Labels say "characters" for these projects. Commit.

### Task H10: Gate 8 and the release

- [ ] Update STATUS, the help page and `docs/licenses.md`. Run `npm run typecheck`, `lint`, `format:check`, `test`, `build`, `size` and the Chromium and phone suites. Expected: PASS.
- [ ] Add Codex entries and notes to the memoir leak test (Review Focus 4).
- [ ] A fresh review agent that has not seen the implementation reviews the Phase 8 diff against Review Focus 1 to 6. Fix each high finding.
- [ ] Open pull request H-D. Ask you to run "Run workflow" for all 4 browsers.
