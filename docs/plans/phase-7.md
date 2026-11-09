# Phase 7: Safe and Simple Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Vlo never loses a word and is easy to start. This phase builds the roadmap's "Safe launch" features (F31 to F38 in the roadmap doc). Phase 6 in the repository was the spec's "Hardening and launch", so these features are not built yet.

**Architecture:** Each new feature reuses a path that exists and has tests. Every import makes a `Backup` object in memory and stores it with `importBackup(backup, 'same')`, so an import is all or nothing, as a backup import is now. The walkaway export reads the same export tree (`buildExportDoc`) as every other export. Automatic backups extend folder save (`src/features/backup/folder.ts`). Tool levels change only which registry ids the toolbar shows. The project language goes in `Project.settings`, so the database and the backup format keep their versions.

**Tech Stack:** JSZip and `DOMParser` (both in use now) for DOCX and Scrivener files, `markdown-it` for Markdown (decision P2), `prosemirrorJSONToYDoc` from `@tiptap/y-tiptap` with the prose and poem schemas, Dexie, Vitest, Playwright.

**Spec and sources:** the roadmap doc ("Vlo roadmap: beat every writing app", features F31 to F38 and the design rules), `docs/VLO_SPEC.md` sections 5, 9, 12 and 15, ADR 0003 and ADR 0005, `docs/STATUS.md`.

**Already done:** folder save writes a backup and a Markdown copy when the writer leaves a project (F29). Each project card shows its backup date, and the Library reminds after 7 days (`reminder.ts`). Settings shows the storage state (`StorageHealth.tsx`) and the Safari install steps. The save status is a live region, so a screen reader speaks it. `countWords` uses `Intl.Segmenter`. Atkinson Hyperlegible Next is a Vlo font.

## Decisions for the product owner

| # | Topic | Recommendation | Other choice |
| --- | --- | --- | --- |
| P1 | Automatic backup copies (F32) | Folder save keeps one dated copy per day and the last 10 days for each project. Vlo deletes only its own older copies: files in the project's subfolder whose names match Vlo's dated backup name. | Vlo never deletes a file. The folder grows by one file each day, and the writer cleans it. |
| P2 | Import readers (F34) | No new package. Small DOCX and RTF readers on JSZip and `DOMParser`. `markdown-it` moves from development to app packages (MIT, 42 KB gzip, loads only when the writer imports Markdown). | Add `mammoth` 1.13.0 for DOCX (BSD-2, lazy). It reads more Word features, such as tables, but adds a package to maintain. |
| P3 | Remove a template (F35) | The writer can remove a template only when no item uses a kind that would go away. The dialog lists those items, so the writer moves or deletes them first. View data (cards, people, sequences) stays, and it shows again if the writer adds the template back. | Vlo turns those items into pages and adds Open writing. A poem then opens in the prose editor, so hanging indents can change. |
| P4 | Tool level default (F36) | Simple for a writer with no projects on the device. Full for a writer who has a project when this build first opens, so no tool that a writer uses goes away. Settings and the toolbar's More menu switch the level. | Simple for every writer. |
| P5 | Reading comfort (F37) | No new font. A "Show my text in Atkinson Hyperlegible Next" switch on this device, plus letter, word and line spacing. It changes the screen only, never the project font or exports. | Add OpenDyslexic (`@fontsource/opendyslexic`, SIL OFL) as a fifth comfort font. Studies show no reading gain over a clear sans font, but some writers ask for it by name. |
| P6 | Languages (F38) | This phase: a language for each project, right-to-left text, character counts for Chinese and Japanese, and the language in each export. App text in other languages waits for roadmap decision D3. | Make all app text ready for translation now. That touches almost every component, so it needs its own phase. |
| P7 | Walkaway export (F33) | One "Download all my writing" button in Settings. The zip has a folder for each project, one Markdown file for each item in binder order, and one `index.html` that opens offline in any browser. Real names stay, as in a backup. | One project at a time, from the Export dialog. |

## Packages

- P2 recommended: `markdown-it` 15.0.3 moves to `dependencies` (no new package in the lock file).
- P2 other choice: `mammoth`. P5 other choice: `@fontsource/opendyslexic`.

## Global Constraints

- Everything in the Phase 0 to 6 plans' Global Constraints still holds: only `src/lib/net.ts` makes requests, Pen mode sends nothing, WCAG 2.2 AA in each theme, and each budget in spec section 12.
- Never lose a word (roadmap rule 1). Each feature that writes data gets a test for save, reload, backup and import. An import that fails leaves no project and no `vlo-item-*` database.
- Simple first (roadmap rule 2). A new tool stays hidden until the writer asks for it, in Settings, the More menu or the command menu.
- Initial JavaScript stays under 250 KB gzip (208 KB now). Import readers, `markdown-it` and the walkaway export load only on use.
- Each import keeps the order, the titles, the synopses and the poem indents of the source. A poem line keeps each leading space and tab.
- Database version 6 and backup version 3 stay. New fields are optional, and an older build ignores them.
- The new theme passes axe with 0 serious issues on every route and the 7:1 contrast check for body text.

## Review Focus

1. **A folder clean-up that deletes a writer's file.** Expected: the clean-up deletes only names that `backupFileName` makes for that project, in Vlo's subfolder, and never the last 10. Pinned in Task G2.
2. **An import that leaves half a project.** Expected: a damaged DOCX, `.scriv` or Markdown folder gives a clear message, and the Library and IndexedDB have no new rows or databases. Pinned in Task G4.
3. **An import that changes a poem.** Expected: the poem fixture imported from plain text, Markdown and DOCX holds every character and indent after a reload. Pinned in Task G4.
4. **A template removal that hides an item.** Expected: removal is refused while an item uses a kind that goes away, and every item stays in the binder. Pinned in Task G5.
5. **A tool level that hides a tool from a screen reader or the keyboard.** Expected: every registry tool runs from the command menu in 2 actions or fewer at the Simple level. Pinned in Task G6.
6. **Right-to-left text that breaks the caret or the poem indents.** Expected: a Hebrew poem keeps its indents on the right side, and the arrow keys move in the visual order. Pinned in Task G9.

---

## Part G: Safe and simple (four pull requests)

Pull request G-A: Tasks G1 to G3. G-B: Task G4. G-C: Tasks G5 to G7. G-D: Tasks G8 to G10. Each one merges alone.

### Task G1: Safety badge (F31)

**Files:** Create `src/features/backup/safety.ts`, `src/features/backup/SafetyBadge.tsx`, `tests/unit/safety.test.ts`, `tests/e2e/safety.spec.ts`. Modify `src/app/AppShell.tsx`, `tests/e2e/backup.spec.ts` (its project-age helper moves to `tests/e2e/support/seed.ts`).

**Interfaces:**

- Produces: `safetyState(input: { projects: Project[]; safari: boolean; folder: FolderStatus | null; now: number }): { level: 'safe' | 'check' | 'risk'; reasons: SafetyReason[] }`. Pure, so the unit test covers each case.

- [ ] Tests first: recent backups give `safe`; a project with `backupDue` gives `check`; Safari outside an installed app gives `risk` with the install reason; a failed last folder save gives `check` with the project title. Storage protection stays in Settings: most browsers refuse it outside an installed app, so it would keep the badge on Check.
- [ ] The badge sits in the site header when the device has a project. It shows one word and an icon (Safe, Check, At risk). A click opens a popover with the reasons, a Back up button for each project that is due, and a link to Settings for the other reasons. There is no device count until sync exists (roadmap Phase 8).
- [ ] `safety.spec.ts`: the badge passes axe in each theme, its popover closes with Escape and gives the focus back, and it sends 0 requests. Commit.

### Task G2: Automatic backups (F32)

**Files:** Modify `src/features/backup/folder.ts`, `src/features/backup/file.ts`, `src/features/backup/reminder.ts`, `src/features/backup/FolderSave.tsx`, `src/features/backup/BackupDialog.tsx`, `src/features/library/LibraryPage.tsx`, `src/features/project/ProjectPage.tsx`, `src/features/help/help.ts`. Create `src/features/backup/downloadBackup.ts`. Modify `tests/unit/folder-save.test.ts`, `tests/e2e/folder-save.spec.ts`, `tests/e2e/backup.spec.ts`.

**Interfaces:**

- Produces: `KEEP_BACKUPS = 10` and `oldBackups(names: string[], title: string): string[]`. Pure: it returns the dated Vlo backup names of that title past the newest 10.

- [ ] Tests first for `oldBackups`: 12 dated names give the 2 oldest; a name with another title, another extension or no date is never in the result; a writer's own file named "notes.vlo.zip" is never in the result.
- [ ] `saveToFolder` writes `backupFileName(title, today)` in place of the fixed name. A second save on the same day replaces that day's file. The Markdown copy keeps its fixed name. After the write, Vlo deletes the names from `oldBackups`. A failed delete does not fail the save.
- [ ] A save on leaving the project or the tab stays. Add a save every 10 minutes while the project is open. It writes only when the writing changed since the last backup.
- [ ] With no folder save (every browser but Chromium, or Chromium with no folder): after a change, the Library's "Time for a backup" list shows the project. One press downloads the backup, with no dialog. The project leaves the list until the next change. The safety badge keeps the 7-day rule.
- [ ] Settings explains the 10-day history in one sentence. Run the folder save tests. Commit.

### Task G3: Walkaway export (F33)

**Files:** Create `src/features/export/walkaway.ts`, `src/features/backup/WalkawayExport.tsx`, `tests/unit/walkaway.test.ts`. Modify `src/features/settings/SettingsPage.tsx`, `src/features/help/help.ts`, `tests/e2e/backup.spec.ts`, `package.json` (`markdown-it` moves to app packages, decision P2).

**Interfaces:**

- Produces: `walkawayZip(projects: Backup[]): Promise<Uint8Array>`. It reads each item with the export reader (`itemBlocks`), writes `<project>/<nn> <folder>/<nn> <item>.md` with `toMarkdown`, renders the whole project's Markdown to `<project>/index.html` with `markdown-it`, and writes a top `index.html` that links each project. Notes come too, because the zip is the writer's own copy.

- [ ] Tests first with the novel, memoir and poetry fixtures: the file order follows the binder; each Markdown file matches `toMarkdown` for that item; `index.html` holds every item title in order and no `<script>`; each poem line keeps its leading spaces as no-break spaces and ends with a hard break; two items with the same title get two files.
- [ ] `index.html` uses one inline style sheet and the system fonts, so it opens offline with no other file. Equations keep their LaTeX, as in the Markdown export.
- [ ] Settings, under Backup: "Download all my writing", with one sentence on what the zip holds. Commit, then open pull request G-A.

### Task G4: Import from other tools (F34)

**Files:** Create `src/features/import/` with `tree.ts`, `outline.ts`, `markdown.ts`, `docx.ts`, `rtf.ts`, `scrivener.ts`, `read.ts` and `ImportWriting.tsx`. Create `tests/fixtures/import.ts` (a Word file and a Scrivener 3 project, made from their XML and RTF in the test), `tests/unit/import.test.ts` and `tests/e2e/import.spec.ts`. The e2e test also imports the Markdown folder `tests/fixtures/novel`. Modify `src/features/library/projects.ts` (`newProject`) and `src/features/library/LibraryPage.tsx`.

**Interfaces:**

- Produces: `ImportSource = { title: string; nodes: ImportNode[]; skipped: string[] }` with `ImportNode = { title: string; synopsis?: string; text?: { html: string; poem: string }; children?: ImportNode[]; note?: true }`. Each reader gives HTML for prose and plain lines for poems, so the prose editor's own parse rules read the text, as for a paste.
- Produces: `placeNodes(nodes, templates)` fits the tree to the templates' kinds and nesting rules, and drops no text. `toBackup(source, templates, now): Backup` makes the ids, the order keys, the Yjs updates (`prosemirrorJSONToYDoc` with the prose or poem schema), the `itemTexts` and the counts. The dialog stores it with `importBackup(backup, 'same')`, so an import is all or nothing.
- Produces: `readPicked(files: PickedFile[]): Promise<ImportSource>` reads loose files, a folder or a zip, and sends a Scrivener project to `readScrivener`.

- [x] Tests for `toBackup`: the backup passes `readBackup`; order, nesting, synopsis, word counts and marks stay; a poem keeps every space after `importBackup`.
- [x] Plain text: one file is one item. A blank line splits paragraphs. A poem keeps its lines as written.
- [x] Markdown file or folder (Obsidian too): a folder is a folder, a file is an item, and `#` and `##` headings split a file into a folder and items. Front matter `title` and `synopsis` fill the item fields. Wiki links keep their text, and `[^1]` footnotes become Vlo footnotes. A poem from Vlo's Markdown export comes back with its spaces. Hidden folders such as `.obsidian` stay out.
- [x] Word (DOCX): Heading 1 (or Title) starts a folder and Heading 2 an item. With no headings, the file is one item. Bold, italic, underline, strike, superscript, subscript and line breaks stay. Footnotes become Vlo footnotes. Tables and pictures go in the import summary.
- [x] Scrivener (`.scriv` folder or its zip): read the `.scrivx` binder for order, titles and types, `content.rtf` for text and `synopsis.txt` for synopses (Scrivener 3, and the `Files/Docs` layout of Scrivener 2). The Draft becomes the binder, other top folders such as Research become notes, and the Trash stays out. The RTF reader keeps paragraphs, tabs, bold, italic, underline, strike, footnotes, `\uN` and `\'hh` characters, and puts pictures and tables in the summary.
- [x] The Library "Import writing" dialog takes files, a zip or a folder (`webkitdirectory`), shows a summary (texts, words, skipped parts), asks for the title and the templates, and imports on one press. A Vlo backup in the picker gives a message that names "Import backup".
- [x] `import.spec.ts`: a Word file, a Scrivener zip and a Markdown folder import, and the binder order stays after a reload; a damaged file shows the message and adds no project (Review Focus 2). Commit, then open pull request G-B.

### Task G5: Change templates later (F35)

**Files:** Create `src/features/library/TemplatesDialog.tsx`, `tests/unit/change-templates.test.ts`, `tests/e2e/change-templates.spec.ts`. Modify `src/features/library/templates.ts` (`misfits`), `src/features/library/projects.ts` (`changeTemplates`), `ProjectCard.tsx` and `LibraryPage.tsx` (one menu entry, next to Rename), `docs/adr/0005-mixed-templates.md` (close the open point).

**Interfaces:**

- Produces: `misfits(items: readonly Item[], templates: readonly Template[]): Item[]`, the items in binder order whose kind or place the templates do not allow.
- Produces: `changeTemplates(projectId, templates): Promise<Item[]>`. It checks `misfits` again and saves in one transaction, and it returns the blocking items with no change.

- [x] Tests first: adding any template never blocks; removing poetry from a poetry and open project blocks on each poem only; removing a template whose kinds the others share is fine; a folder inside a folder blocks when Open writing goes.
- [x] The dialog reuses the template checkbox cards from `TemplatePicker.tsx` (the last template stays). A blocked removal lists each item as a link to it, and Save stays off. The binder and the view tabs read the project live, so they change at once.
- [x] A browser test: add Memoir to a novel, add a life stage in the Timeline, remove Memoir, add it back, and the life stage is still there. Commit.

### Task G6: Simple and Full tool levels (F36)

**Files:** Modify `src/features/editor/writingPrefs.ts` (`toolLevel`, `startWithSimpleTools`), `src/features/editor/toolbar/Toolbar.tsx`, `src/features/settings/SettingsPage.tsx`, `src/features/onboarding/firstVisit.ts`, `tests/e2e/support/onboarding.ts`. Create `tests/unit/tool-level.test.tsx`, `tests/e2e/tool-level.spec.ts`.

**Interfaces:**

- Produces: `WritingPrefs.toolLevel: 'simple' | 'full'`. The Simple level is the phone toolbar at every width: prose shows Undo, Redo, Text style, Bold, Italic and More; a poem shows Undo, Redo, the hanging indent controls and More. The More menu holds every other tool, so the toolbar needs no second list of tools.

- [x] Tests first: at the Simple level each toolbar shows 8 controls or fewer; every tool of the Full toolbar is in the toolbar or the More menu at the Simple level; a new writer starts at Simple and a stored level stays.
- [x] The default follows decision P4: the welcome (only a writer with no projects sees it) sets Simple. With no stored level (an existing writer), the toolbar shows every tool. The toolbar's More menu ends with "Show all tools" or "Show fewer tools", and Settings > Writing has the same choice. The e2e helper `skipOnboarding` starts the other tests at Full.
- [x] `tool-level.spec.ts`: a new writer gets the Simple toolbar, a hidden tool runs from the More menu in 2 actions (open the menu, pick the tool), both switches work, and axe passes. Commit.

### Task G7: Gate for pull request G-C

- [ ] Run the checks and the Chromium and phone suites. Update STATUS. Open pull request G-C.

### Task G8: Comfort and access (F37)

**Files:** Modify `src/app/preferences.ts`, `index.html`, `src/styles/themes.css`, `src/styles/editor.css`, `src/features/editor/format/palette.ts`, `src/features/editor/writingPrefs.ts`, `src/features/editor/Editor.tsx`, `src/features/settings/SettingsPage.tsx`, `src/features/project/CommandMenu.tsx`, `tests/e2e/a11y.spec.ts`. Create `src/features/settings/ComfortSettings.tsx`, `docs/screen-reader-test.md`, `tests/unit/comfort.test.ts`, `tests/e2e/comfort.spec.ts`, `tests/e2e/screen-reader.spec.ts`.

- [x] A fifth theme choice, Contrast: black text on white. Text, muted text and links meet 7:1, and borders 3:1 or more (`contrast.test.ts`). The palette colors use their Paper values. `a11y.spec.ts` runs it on every route and dialog.
- [x] A Reading comfort section in Settings: the comfort font switch (decision P5), and Standard, Wider and Widest steps for letter spacing (0, 0.05 and 0.1 em), word spacing (0, 0.1 and 0.2 em) and line height (1.7, 2 and 2.3). The values are on this device and set CSS variables on the editor only, so the project and its exports do not change. The page-end lines measure the screen, so they follow the comfort values.
- [x] `docs/screen-reader-test.md`: a script for NVDA with Firefox and VoiceOver with Safari. Create a project, write, take a snapshot, reorder in the binder, export, back up and rename, each with the keyboard only. `screen-reader.spec.ts` runs the same steps by role and name only. It found one bug: on its first open the command menu loaded after the dialog took focus, so typed keys went nowhere. The field now takes focus when the menu loads. Commit.

### Task G9: Every language, first part (F38)

**Files:** Create `src/lib/language.ts`, `tests/unit/language.test.ts`, `tests/e2e/rtl.spec.ts`. Modify `src/lib/db.ts` (`Project.settings.language?: string`), `src/features/backup/file.ts`, `src/features/editor/Editor.tsx`, `EditorPane.tsx`, `PageControl.tsx` (the picker), `extensions/poem.ts` and `src/styles/editor.css` (indents on the side where a line starts), `src/features/export/model.ts`, `build.ts`, `epub.ts`, `docx.ts`, `pdf/pdf.ts` (document language only) and `walkaway.ts`.

**Interfaces:**

- Produces: `textDirection(language: string | undefined): 'ltr' | 'rtl'`, `cleanLanguage(value: unknown): string | undefined` and `languageLabel(language)`. `ExportDoc.language` is the project language or `en`.

- [x] Tests first: Hebrew, Arabic, Persian, Urdu and Yiddish give `rtl`; English, Chinese and no language give `ltr`; a tag that is not valid gives none.
- [x] The Page popover has "Language of the writing". The editor text gets `lang` and `dir` from the project, so the browser picks its spell-check dictionary where it can. Poem hanging indents, quotes and lists use the side where a line starts.
- [x] EPUB `xml:lang`, `dc:language`, `dir` and a right-to-left page order; the DOCX run language and right-to-left paragraphs; the PDF language; the walkaway pages' `lang` and `dir`.
- [x] `rtl.spec.ts`: a Hebrew poem reads from the right and keeps its hanging indent on the right after a reload (Review Focus 6). Commit.
- [ ] Not in this phase (product owner decision, 2026-11-09, pending): character counts for Chinese and Japanese, the PDF layout of right-to-left text, and the language in a shared reading link. The PDF draws each line from the left, and the reading link shows the text from the left.

### Task G10: Gate 7 and the release

- [ ] Update STATUS, the roadmap doc's feature table, and `docs/licenses.md`. Run `npm run typecheck`, `lint`, `format:check`, `test`, `build`, `size` and the Chromium and phone suites. Expected: PASS.
- [ ] A fresh review agent that has not seen the implementation reviews the Phase 7 diff against Review Focus 1 to 6. Fix each high finding.
- [ ] Open pull request G-D. Ask you to run "Run workflow" for all 4 browsers.
