# Phase 13: Every form

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Status:** the product owner approved roadmap 2 decisions R1 to R6 as recommended on 2026-11-10. Decisions M1 to M5 follow those answers.

**Goal:** Three groups of writers that Vlo does not serve now can use it. A writer who cannot type for long speaks into any item, and the words go in on the device. A script writer drafts a screenplay or a stage play in industry format, with Fountain and Final Draft files. An essay or nonfiction writer cites sources from Zotero and gets a bibliography in each export. This phase builds roadmap 2's F62, F63 and F64.

**Architecture:** Each feature reuses a part that Vlo has now. Speak to write is the recorder and the Whisper worker of F57 behind one button. A script is a third editor kind, `script`, with one block node, `scriptLine`, whose `role` attribute gives the element. Fountain and FDX are two more export writers and one more import reader in the export and import trees. Citations are one new table and one inline atom node, `cite`. The export tree turns each `cite` into text and adds a bibliography section.

**Tech Stack:** React, TipTap, Yjs, Dexie, the Whisper worker (Transformers.js), pdf-lib, Vitest, Playwright. No new runtime package.

**Spec and sources:** roadmap 2 (F62 to F64, decisions R2, R3 and R6), `docs/VLO_SPEC.md` sections 5, 9 and 12, ADR 0005 (templates), `docs/plans/phase-11.md` (Task K9), `docs/STATUS.md`.

**Not in this phase:** script production tools (schedules, call sheets). Script revision colors and locked pages. All CSL styles (decision R3). Speech to text that streams while the writer speaks.

## Decisions for the product owner

| # | Topic | Recommendation | Other choice |
| --- | --- | --- | --- |
| M1 | Speak to write (F62) | "Speak to write" in More tools, the / menu and the command menu of every item. One press starts, one press stops, and the text goes in at the cursor. Clips stop at 30 seconds. It uses the Whisper base model of F57 (decision R6). | A held key (push to talk). |
| M2 | Script template (F63) | One "Script" template with the kinds Act, Sequence and Scene. A project setting picks Screenplay or Stage play (decision R2). Tab moves to the next element, and Enter picks the element that usually follows. | Two templates. |
| M3 | Script files (F63) | Fountain import and export, FDX export, and a PDF in Courier Prime 12 pt on US Letter with the standard screenplay margins. Stage play PDF follows the common stage play layout. | FDX import too. |
| M4 | Citations (F64) | Sources import from BibTeX or CSL-JSON, or the writer types one in. "Cite" (Ctrl+Shift+C and the / menu) puts a citation at the cursor. Export gives in-text citations and a bibliography in APA 7, MLA 9 or Chicago author-date, from Vlo's own formatter (decision R3). Citations show in Open writing and in memoir. | Footnote citations (Chicago notes and bibliography) too. |
| M5 | Pull requests | Three pull requests: M-A (Task M1), M-B (Tasks M2 to M4), M-C (Tasks M5 to M7). | One pull request. |

## Global Constraints

- Everything in the Phase 0 to 12 plans' Global Constraints still holds: only `src/lib/net.ts` makes requests, Pen mode sends no AI request, WCAG 2.2 AA in each theme, each budget in spec section 12, and the Part J0 UI and motion rules of `docs/plans/phase-10.md`.
- Never lose a word. Each new node, table and field gets a test for save, reload, backup, import and sync.
- Simple first. Script tools show only in a Script project. Citations show only after the writer adds a source. Speak to write is in More tools, and the command menu opens it at every level.
- Audio never leaves the device. During speak to write, the network log shows no request.
- One Dexie version, one backup version and one `DOC_SCHEMA` step for each pull request that adds a node, a table or a field that needs an upgrade.

## Review Focus

1. **Audio that leaves the device.** Expected: a speak to write session sends no request. Pinned in Task M1.
2. **A script element that loses its role.** Expected: a role survives save, reload, backup, import, sync, a version switch and a Fountain round trip. Pinned in Task M2.
3. **A script PDF with the wrong layout.** Expected: margins, line spacing and lines per page match a public-domain screenplay fixture within 1 pt. Pinned in Task M4.
4. **A citation that changes the writer's text.** Expected: a deleted source leaves its citations as "[missing source]", and an export lists them in its notices. Pinned in Task M6.

---

## Part M: Every form (three pull requests)

### Task M1: Speak to write (F62)

**Files:** Create `src/features/voice/SpeakPanel.tsx`, `src/features/voice/useSpeech.ts`, `src/features/voice/SpeechParts.tsx`, `tests/unit/speak.test.tsx`, `tests/e2e/speak.spec.ts`. Modify `src/features/voice/RecordDialog.tsx`, `src/features/editor/commands/registry.ts`, `src/features/editor/toolbar/Toolbar.tsx`, `src/features/editor/toolbar/PanelHost.tsx`, `src/features/help/help.ts`, `src/features/policy/privacy.ts`, `docs/privacy.md`.

- [x] Tests first: a fake model's text goes in at the cursor and the panel closes; the clip stops by itself at 30 seconds, one time; the first use asks before the model downloads, and Cancel puts nothing in; a panel that closes during a recording drops the audio; a clip with no words gives a message. In the browser: a poem gets the panel from the command menu, axe finds no serious issue, and no request leaves the device.
- [x] The panel reuses `startRecording`, `transcribe` and `insertDictation`. The recorder state, the model question and the download moved from the memoir dialog to `useRecorder`, `useSpeech` and `SpeechParts`, which both surfaces share. Commit.
- Built: the panel opens at the caret, like Read aloud. It keeps no audio, so a failed clip must be spoken again. Help version 10 and privacy page version 7 say so.

### Task M2: The script editor (F63)

**Files:** Create `src/features/editor/extensions/script.ts`, `tests/unit/script.test.ts`. Modify `src/lib/db.ts` (`Template` gets `'script'`, `Project.settings.scriptStyle?`), `src/features/library/templates.ts` (`editorKind` gets `'script'`), `src/features/editor/docSchema.ts` (`DOC_SCHEMA` 8), `src/features/backup/file.ts`, `src/features/help/help.ts`.

**Interfaces:**

- Produces: `ScriptRole = 'heading' | 'action' | 'character' | 'parenthetical' | 'dialogue' | 'transition' | 'lyric'` and the node `scriptLine` with `attrs.role: ScriptRole`.
- Produces: `nextRole(role: ScriptRole, key: 'Enter' | 'Tab'): ScriptRole`.

- [x] Tests first: Tab and Enter give the expected next role; a role survives save, reload, backup, import, sync and a version switch; an older build refuses a document with schema 8.
- [x] A role menu on the toolbar and in the / menu. Character names complete from the Codex. Commit.
- Built: a script scene is a new item kind, `script`, so a project can mix Script with other templates. Acts and sequences reuse the `part` and `chapter` folders. The roles live in `src/features/editor/scriptRoles.ts`, with no editor code, so the export worker reads them. Backup version 8. The Script layout (screenplay or stage play) is in the page menu of a script scene. The text keeps what the writer typed, and the editor and each export show a scene heading, a character and a transition in capitals.

### Task M3: Fountain in and out (F63)

**Files:** Create `src/features/export/fountain.ts`, `src/features/import/fountain.ts`, `tests/unit/fountain.test.ts`, `tests/fixtures/scripts/*`. Modify `src/features/export/notices.ts` (`ExportFormat` gets `'fountain'` and `'fdx'`), `src/features/export/run.ts`, `src/features/import/ImportWriting.tsx`.

- [x] Tests first: a Fountain fixture imports with each role and each scene in the binder, and exports to the same text; forced elements (`!`, `@`, `>`, `.`) keep their role; FDX opens as XML with one `Paragraph` for each line and the right `Type`.
- [x] Table read (F58) reads a script by its character lines with no speaker guess. Commit.
- Built: `src/features/export/fountain.ts` writes both files from the export tree. A Fountain section (`#`, `##`) is an act or a sequence, a `=` synopsis goes on its scene, and notes and boneyard stay in the text. Final Draft has no lyric element, so a lyric is italic dialogue. A Script project offers the two formats in the export dialog. The import dialog says "pick Script" when a file is a script and the pick is not. `xmlText` moved to `src/features/export/xml.ts` for the EPUB and FDX writers.

### Task M4: The script PDF (F63)

**Files:** Create `src/features/export/pdf/script.ts`, `tests/unit/script-pdf.test.ts`. Modify `src/features/export/pdf/pdf.ts`.

- [x] Tests first: each role's left margin and width; 55 lines per page; "(MORE)" and "(CONT'D)" when dialogue breaks across a page; scene headings never end a page; the stage play style puts character names in the center.
- [ ] Check the PDF of the public-domain fixture by hand against its original. Commit.
- Built: `buildExportDoc` sets `script` on an export that holds only script scenes, and `toPdf` then uses `pdf/script.ts`. The layout is a pure function of lines and places, so the tests read it with no PDF. A title page names the title and the author, and the pages from page 2 have numbers. A script project offers no book layout. The fixture is Vlo's own short script (`tests/fixtures/scripts/night-ferry.fountain`). The check by hand against a public-domain screenplay PDF waits for the product owner.

### Task M5: Sources (F64)

**Files:** Create `src/features/cite/sources.ts`, `src/features/cite/SourcesPanel.tsx`, `tests/unit/sources.test.ts`. Modify `src/lib/db.ts` (table `sources`, database version 13), `src/features/sync/*`, `src/features/backup/file.ts` (backup version 8), `src/features/library/projects.ts`.

- [x] Tests first: a BibTeX file and a CSL-JSON file from Zotero import with authors, title, container, year, pages and DOI; a duplicate key gets a suffix; sources round trip through save, reload, backup, import and sync.
- [x] The Sources panel in More tools lists, edits and deletes sources, with Undo. Commit.
- Built: the backup version is 9, because M-B took version 8. A source has a type (book, chapter, article or web page) and a key that does not change after the writer adds it. A citation names its source by that key, not by its id, so a copy of the project keeps its citations with no change to the text. The BibTeX reader turns LaTeX accents into letters and keeps the characters of a URL. A CSL-JSON id that is a Zotero link is no key, so Vlo makes one from the first author and the year. "Cite a source" opens the panel from More tools in Open writing and memoir. The editor reads the sources from `cite/sourceStore.ts`, which the project screen fills.

### Task M6: Citations in the text (F64)

**Files:** Create `src/features/editor/extensions/cite.ts`, `tests/unit/cite.test.ts`. Modify `src/features/editor/extensions/prose.ts`, `src/features/editor/extensions/slashMenu.ts`, `src/features/editor/docSchema.ts` (`DOC_SCHEMA` 9).

- [x] Tests first: "Cite" puts an inline `cite` atom with the source id and an optional page; the atom shows the short form of the project's style; a deleted source shows "[missing source]"; copy and paste between items keeps the atom.
- [x] Commit.
- Built: the atom holds the source's key, not its id (see Task M5). Its plain text is Pandoc's form, such as "[@marlow2019, 12]", for search, copies and readable backups. The node view reads the sources and the style from `cite/sourceStore.ts`, so a change of either changes each citation at once. The panel's Style list sets `settings.citeStyle`. "Cite a source" has no shortcut, which changes decision M4: Chrome keeps Ctrl+Shift+C and Cmd+Option+C for its inspector, so the writer types "/cite" or uses the command menu.

### Task M7: Bibliography in exports and Gate 13

**Files:** Create `src/features/cite/styles.ts`, `tests/unit/cite-styles.test.ts`. Modify `src/features/export/build.ts`, `src/features/export/notices.ts`, `src/features/help/help.ts`, `docs/STATUS.md`, `docs/licenses.md`.

- [x] Tests first: fixtures of a book, a chapter, a journal article and a web page give the published examples of APA 7, MLA 9 and Chicago author-date; each export format has the in-text citations and a bibliography section; a missing source shows in the export notices.
- Built: `cite/styles.ts` gives the in-text form and the reference list entry. The published examples are the APA Style website's journal article and chapter, two MLA 9 examples from a university guide, and a Chicago 18 book. Chicago 18 lists a chapter with no page range and puts "et al." after the first author in the text for three or more authors. MLA shortens the second page number (201–19). A title keeps the case that the writer typed. `buildExportDoc` gives each citation its text and adds the list of the cited sources as the last section, when the caller passes the sources: the Export dialog, share links, packets and the book preview do. A readable backup keeps "[@key]". An entry hangs by half an inch in Word, PDF and EPUB. `tests/e2e/cite.spec.ts` adds a source, cites it from the / menu, changes the style and exports Markdown.
- [x] Gate 13: run `npm run typecheck`, `lint`, `format:check`, `test`, `build`, `size` and the Chromium and phone suites. A fresh review agent reviews the Phase 13 diff against Review Focus 1 to 4. Ask the product owner to run "Run workflow" for all 4 browsers.
- Built: the fresh review found 7 issues, and PR M-C fixed each one. A Fountain speech line kept its role only when it started with no mark. A scene heading could end a PDF page before a speech. A backup with two sources of one key did not restore. The Sources panel lost focus after a form or an Undo, and the Speak to write timer was read out each second. A new source with the key of a deleted source takes its citations, as in Pandoc. That stays, and the code says so.
