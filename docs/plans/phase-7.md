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

**Files:** Modify `src/features/backup/folder.ts`, `src/features/backup/FolderSave.tsx`, `src/features/library/LibraryPage.tsx`. Create `tests/unit/folder-history.test.ts`. Modify `tests/unit/folder-save.test.ts`, `tests/e2e/folder-save.spec.ts`.

**Interfaces:**

- Produces: `KEEP_BACKUPS = 10` and `oldBackups(names: string[], title: string): string[]`. Pure: it returns the dated Vlo backup names of that title past the newest 10.

- [ ] Tests first for `oldBackups`: 12 dated names give the 2 oldest; a name with another title, another extension or no date is never in the result; a writer's own file named "notes.vlo.zip" is never in the result.
- [ ] `saveToFolder` writes `backupFileName(title, today)` in place of the fixed name. A second save on the same day replaces that day's file. The Markdown copy keeps its fixed name. After the write, Vlo deletes the names from `oldBackups`. A failed delete does not fail the save.
- [ ] A save on leaving the project or the tab stays. Add a save after each 10 active minutes, with the same active-minute count that snapshots use.
- [ ] Other browsers (no folder save): after a session that changed the writing, the Library shows one "Back up now" bar for that project. One press downloads the backup. The bar does not show again until the next change.
- [ ] Settings explains the 10-day history in one sentence. Run the folder save tests. Commit.

### Task G3: Walkaway export (F33)

**Files:** Create `src/features/export/walkaway.ts`, `tests/unit/walkaway.test.ts`. Modify `src/features/export/epub.ts` (export its block-to-HTML function), `src/features/settings/SettingsPage.tsx`.

**Interfaces:**

- Produces: `walkawayZip(projects: Backup[]): Promise<Uint8Array>`. It reads each project through `buildExportDoc` and writes `<project>/index.html`, `<project>/<nn> <folder>/<nn> <item>.md`, and a top `index.html` that links each project.

- [ ] Tests first with the novel, memoir and poetry fixtures: the file order follows the binder; each Markdown file matches `toMarkdown` for that item; `index.html` holds every item title in order and no `<script>`; each poem line keeps its leading spaces (`white-space: pre-wrap`); two items with the same title get two files.
- [ ] `index.html` uses one inline style sheet and the system fonts, so it opens offline with no other file. Math shows as MathML, as in EPUB.
- [ ] Settings, under Backup: "Download all my writing", with one sentence on what the zip holds. Commit, then open pull request G-A.

### Task G4: Import from other tools (F34)

**Files:** Create `src/features/import/` with `model.ts`, `toBackup.ts`, `plain.ts`, `markdown.ts`, `docx.ts`, `rtf.ts`, `scrivener.ts`, `ImportDialog.tsx`. Create `tests/fixtures/import/` (a small DOCX, a Scrivener 3 project and a Markdown folder, made by a script in `scripts/`) and `tests/unit/import-*.test.ts`, `tests/e2e/import.spec.ts`. Modify `src/features/library/LibraryPage.tsx`, `package.json`.

**Interfaces:**

- Produces: `ImportTree = { title: string; templates: Template[]; nodes: ImportNode[] }` with `ImportNode = { kind: ItemKind; title: string; synopsis?: string; blocks?: ImportBlock[]; poem?: string; children?: ImportNode[] }`. `ImportBlock` holds paragraphs and headings with bold, italic, underline and strike runs.
- Produces: `toBackup(tree: ImportTree, now: number): Backup`. It makes the ids, the order keys, the Yjs updates (`prosemirrorJSONToYDoc` with the prose or poem schema), the `itemTexts` and the word counts. Every reader returns an `ImportTree`, so only `toBackup` knows about storage.

- [ ] Tests first for `toBackup`: the tree's order and nesting come back from `importBackup` and a reload; a poem keeps every space; word counts equal `countWords` of the text.
- [ ] Plain text: one file is one item. A blank line splits paragraphs. In a poetry project each file is a poem with its text as written.
- [ ] Markdown file or folder (Obsidian too): a folder is a part, a file is an item, `#` headings split a file into items when the writer picks "Split at headings". Front matter `title` and `synopsis` fill the item fields. Wiki links keep their text.
- [ ] Word (DOCX): Heading 1 makes a part, Heading 2 a chapter, and the text under it a scene. With no headings, the file is one item. Bold, italic, underline, strike, tabs and line breaks stay. Footnotes become Vlo footnotes. Other features (tables, images) leave a note in the import summary.
- [ ] Scrivener (`.scriv` folder or its zip): read `project.scrivx` for the Draft order, the titles and the types, `content.rtf` for text and `synopsis.txt` for synopses (Scrivener 3, and the `Files/Docs` layout of Scrivener 2). The Draft becomes the binder. The Research folder becomes notes with their text. The RTF reader keeps paragraphs, tabs, bold, italic, `\uN` and `\'hh` characters, and skips pictures and tables with a note in the summary.
- [ ] The Library "Import" menu offers Backup, Word, Markdown, Scrivener and Plain text. The dialog asks for the templates, shows a summary (items, words, skipped parts), and imports on one press. A file picker with `webkitdirectory` reads a folder in every browser.
- [ ] `import.spec.ts`: each fixture imports, reloads and opens its first item; a damaged file shows the message and adds nothing (Review Focus 2). Commit, then open pull request G-B.

### Task G5: Change templates later (F35)

**Files:** Create `src/features/library/changeTemplates.ts`, `src/features/project/TemplatesDialog.tsx`, `tests/unit/change-templates.test.ts`. Modify `src/features/project/ProjectPage.tsx` (one menu entry), `docs/adr/0005-mixed-templates.md` (close the open point).

**Interfaces:**

- Produces: `templateChange(project: Project, items: Item[], next: Template[]): { ok: true } | { ok: false; blocking: Item[] }`.

- [ ] Tests first: adding any template is always `ok`; removing poetry from a poetry and open project with a poem gives that poem in `blocking`; removing a template whose kinds the others share is `ok`; the last template cannot go.
- [ ] The dialog reuses the template checkbox cards from `TemplatePicker.tsx`. A blocked removal lists each item as a link to it. The change saves in one transaction and updates the binder and the view tabs at once.
- [ ] A browser test: add Memoir to a novel, open the Timeline, remove Memoir, add it back, and the Timeline data is still there. Commit.

### Task G6: Simple and Full tool levels (F36)

**Files:** Modify `src/features/editor/writingPrefs.ts` (`toolLevel`), `src/features/editor/toolbar/Toolbar.tsx`, `src/features/settings/SettingsPage.tsx`, `src/features/onboarding/firstVisit.ts`. Create `tests/unit/tool-level.test.ts`, `tests/e2e/tool-level.spec.ts`.

**Interfaces:**

- Produces: `SIMPLE_TOOLS: Record<EditorForm, readonly string[]>`, 8 registry ids or fewer for each form. Prose: `undo`, `redo`, `bold`, `italic`, `heading-2`, `quote`, `footnote`, then More. Poem: `undo`, `redo`, `bold`, `italic`, `hang-less`, `hang-more`, then More.

- [ ] Tests first: each id in `SIMPLE_TOOLS` is in the registry; at the Simple level the toolbar renders 8 controls or fewer; every registry tool is in the More menu or the toolbar at each level.
- [ ] The default follows decision P4. The toolbar's More menu ends with "Show all tools" or "Show fewer tools", and Settings has the same choice.
- [ ] `tool-level.spec.ts`: at the Simple level, each registry tool runs from the command menu in 2 actions or fewer (open the menu, pick the tool), and axe passes. Commit.

### Task G7: Gate for pull request G-C

- [ ] Run the checks and the Chromium and phone suites. Update STATUS. Open pull request G-C.

### Task G8: Comfort and access (F37)

**Files:** Modify `src/app/preferences.ts`, `src/styles/themes.css`, `src/styles/editor.css`, `src/features/settings/SettingsPage.tsx`, `tests/e2e/a11y.spec.ts`. Create `docs/screen-reader-test.md`.

- [ ] A fourth theme, Contrast: black text on white, with 7:1 for body text and 4.5:1 for every control. `a11y.spec.ts` runs it on every route.
- [ ] A Comfort section in Settings: the comfort font switch (decision P5), letter spacing (0, 0.05 and 0.1 em), word spacing (0, 0.1 and 0.2 em) and line height (1.5, 1.8 and 2.1). The values set CSS variables on the editor only, so exports and the page-end lines do not change. The open-scene and keystroke budgets still pass with the widest values.
- [ ] `docs/screen-reader-test.md`: a script for NVDA with Firefox and VoiceOver with Safari. Create a project, write, rename, reorder in the binder, take a snapshot, export and back up, each with the keyboard only. A browser test runs the same steps by role and name only. Commit.

### Task G9: Every language, first part (F38)

**Files:** Modify `src/lib/db.ts` (`Project.settings.language?: string`), `src/lib/wordcount.ts`, `src/features/editor/Editor.tsx`, `src/features/export/epub.ts`, `src/features/export/docx.ts`, `src/features/export/pdf/pdf.ts` (document language only), the project settings panel. Create `tests/unit/language.test.ts`, `tests/e2e/rtl.spec.ts`.

**Interfaces:**

- Produces: `textDirection(language: string | undefined): 'ltr' | 'rtl'` and `countsCharacters(language: string | undefined): boolean` (true for `zh` and `ja`).

- [ ] Tests first: Hebrew, Arabic, Persian and Urdu give `rtl`; English and no language give `ltr`; a Chinese text of 12 characters counts 12; English counts stay as they are.
- [ ] The editor gets `lang` and `dir` from the project. The browser picks its spell-check dictionary from `lang` where it can. Stats, goals and the Library say "characters" in place of "words" for Chinese and Japanese.
- [ ] EPUB `xml:lang`, the DOCX language and the PDF language come from the project.
- [ ] `rtl.spec.ts`: a Hebrew poem keeps its indents on the right after a reload, and a Hebrew export opens with the right direction (Review Focus 6). Commit.

### Task G10: Gate 7 and the release

- [ ] Update STATUS, the roadmap doc's feature table, and `docs/licenses.md`. Run `npm run typecheck`, `lint`, `format:check`, `test`, `build`, `size` and the Chromium and phone suites. Expected: PASS.
- [ ] A fresh review agent that has not seen the implementation reviews the Phase 7 diff against Review Focus 1 to 6. Fix each high finding.
- [ ] Open pull request G-D. Ask you to run "Run workflow" for all 4 browsers.
