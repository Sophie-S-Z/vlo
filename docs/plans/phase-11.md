# Phase 11: Only in Vlo

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Vlo gets the tools that no rival has: a record of authorship that anyone can check, named versions of a scene or poem, checks for six poetry forms, memoir interviews that turn speech into text on the device, a table read of the dialogue, a series of books with one Codex and one style sheet, sprints and month challenges, and a panel of four AI readers. This phase builds the roadmap's "Only in Vlo" features: F54 to F61. Repository Phase 10 built roadmap Phase 9, so this repository phase is roadmap Phase 10, the last phase of the roadmap.

**Architecture:** Each feature reuses a part that Vlo has now. The authorship record counts the source of each edit in an editor plugin next to the `aiOrigin` plugin, and adds signed entries to a hash chain in Dexie. Versions use the snapshot restore path, so a switch keeps every mark. The form checks read the Craft scan. The table read uses the read-aloud engine and the Codex names. The reader panel is one more Reader action. A series is one new table, and its Codex entries are normal Codex rows with a `seriesId`. A sprint is a writing session with a target. The sprint room is one more Supabase migration that stores names and numbers only. Speech to text runs Whisper in a worker with Transformers.js.

**Tech Stack:** React, TipTap, Yjs, Dexie, Web Crypto (SHA-256 and ECDSA P-256), the Web Speech synthesis voices that report `localService`, MediaRecorder, Supabase through `vloFetch`, Vitest, Playwright. One new runtime package: `@huggingface/transformers` (Apache-2.0), loaded only when the writer turns on speech to text.

**Spec and sources:** the roadmap doc ("Vlo roadmap: beat every writing app", F54 to F61, the design rules and decision D4), `docs/VLO_SPEC.md` sections 5, 8.3, 9, 10 and 12, ADR 0004 and ADR 0008, `docs/STATUS.md`, `docs/plans/phase-10.md` (Part J0, the UI and motion rules).

**Already done:** the `aiOrigin` mark and the provenance page. Writing sessions, goals, streaks and deadline goals. Snapshots with a word diff and a restore that keeps marks. The Craft scan (syllables, stress, meter and rhyme letters). Read aloud with on-device voices. The Codex with its mentions table. Reader mode and the "What will be sent" drawer. The style check. Sealed sync and the Supabase relay (off until the Supabase project exists, decision D4).

**Not in this phase:** a public timestamp server for the authorship record. Real-time co-writing (decision D2). App text in other languages (decision D3). Rhyme and meter checks for languages other than English. A shared plot grid across the books of a series.

## Decisions for the product owner

| # | Topic | Recommendation | Other choice |
| --- | --- | --- | --- |
| K1 | Authorship proof (F54) | Each entry holds the time, the minutes, and the characters typed, pasted, dictated, AI-inserted and deleted. It holds no text and no titles. Entries form a SHA-256 hash chain, and a device key (ECDSA P-256, made on the device, never exported) signs each one. A `/verify` page in Vlo checks a record file offline, with no account. The page says what the check proves: the file did not change after Vlo signed it, and the listed keys signed it. | A hash chain with no signature. Anyone can then edit the file and build the chain again. |
| K2 | Versions (F55) | "Versions" in the item menu of a scene, memory, poem or page. A switch keeps the text in the editor as a named version, takes a "Before switch" snapshot, and puts the chosen version in the editor. Compare shows the two versions by paragraph, and "Use this" takes one paragraph from the other version. Versions sync and go in backups. | Each version is a second editable item in split view. |
| K3 | Poetry forms (F56) | A "Form" choice in the Craft panel of a poem: sonnet (Shakespearean or Petrarchan), villanelle, ghazal, haiku, pantoum and sestina. The check lists each problem with its line: line and stanza count, rhyme scheme, refrains, end words, syllables and meter drift. Structure and refrains are checked in every language. Rhyme, syllables and meter are checked in English only. | A custom form editor too. |
| K4 | Memoir voice capture (F57) | "Record a memory" in a memory item: a deck of 60 interview questions in life stages, recording with MediaRecorder, and the audio saved with the memory in its research files. "Turn speech into text" is opt-in. It downloads Whisper base (about 77 MB, many languages) once, shows the size first, and has a Delete button. It runs in a worker on WebGPU, or on WASM when the device has no WebGPU. The text goes in at the cursor as the writer's own words. It works in every AI mode, because it runs on the device and writes only the writer's speech. | Whisper tiny (about 41 MB, less accurate). |
| K5 | Table read (F58) | "Table read" in More tools and the command menu. Vlo finds each quote and gives it to the Codex character named in the same paragraph, or to the speaker before the last one in a two-person exchange, or else to the narrator. The writer picks an on-device voice for each character and for the narrator. The choices stay on this device, because voices differ between devices. | Each quote is read by the narrator voice, with only a change of pitch for each character. |
| K6 | Series (F59) | "Make a series" in the Library joins projects in an order. The books share Codex entries (a "Share with the series" switch on each entry) and one style sheet: a list of preferred words and the forms to avoid, which the style check marks in each book. The Series page shows the books, their word counts, the shared Codex and a mentions table across all books. | A shared plot grid across the books too. |
| K7 | Sprints and challenges (F60) | A sprint is a writing session with a word target and a result. A month challenge sets a target for one month and shows a calendar of daily words in Progress. A sprint room with friends uses a six-letter code, holds at most 20 people, shares only a nickname and a word count, and expires after 24 hours. The room stays off until the Supabase project exists (decision D4). | Solo sprints and challenges only, with no room. |
| K8 | Reader panel (F61) | "Reader panel" in the Assistant in Reader mode. One request asks four readers for notes: a first-time reader, a fan of the genre, a developmental editor and a line editor. The request holds the passage and the notes of the Codex entries that it names, at most 600 tokens. Private names get their aliases. The drawer shows all of it before it goes. No control puts the readers' words in the text. This changes the rule "No AI request reads the Codex" for this one action. | Send only the passage, with no Codex notes. |
| K9 | Pull requests | Four pull requests. K-A (forms, versions, table read, reader panel) starts now on `main`, because it does not touch the book layout files of Phase 10. K-B, K-C and K-D start after Phase 10's last pull request merges. | One pull request for the whole phase. |

## Global Constraints

- Everything in the Phase 0 to 10 plans' Global Constraints still holds: only `src/lib/net.ts` makes requests, Pen mode sends no AI request, WCAG 2.2 AA in each theme, each budget in spec section 12, and the Part J0 UI and motion rules of `docs/plans/phase-10.md`.
- Never lose a word (roadmap rule 1). Each new table and field gets a test for save, reload, backup, import and sync. A version switch and a "Use this" take a snapshot first.
- Simple first (roadmap rule 2). Each tool stays hidden until the writer asks: Versions in the History dialog, the form check with the Craft labels, the table read in the Read aloud panel, the reader panel in the Assistant, sprints in the session timer, the series in the Library, voice capture in a memory item. The command menu opens each one at every level.
- Initial JavaScript stays under 250 KB gzip. Every new screen, panel and worker loads on use. The Transformers.js runtime and its WASM files load only after the writer turns on speech to text, and the service worker does not precache them.
- Proof, not promises. The model download, each sprint room call and each reader panel request go in the network log. Audio never leaves the device.
- One Dexie version and one backup version for each pull request that adds a table or a field that needs an upgrade.

## Review Focus

1. **A record that passes after a change.** Expected: a change of one byte anywhere in the record file fails the check, and the page names the first entry that fails. Pinned in Task K6.
2. **A version switch that loses words or marks.** Expected: after a switch and a switch back, the text, the AI marks, the comments and the private-name marks are the same. Pinned in Task K2.
3. **A real name in a reader panel request.** Expected: a memoir request with a Codex note that holds a private name sends the alias only. Pinned in Task K4.
4. **A form check that marks a correct poem.** Expected: 0 problems for the public-domain fixtures (Shakespeare's Sonnet 130, Robinson's "The House on the Hill", Kipling's "Sestina of the Tramp-Royal", Dobson's pantoum "In Town") and for Vlo's own ghazal and haiku fixtures. Pinned in Task K1.
5. **Text or titles in a sprint room.** Expected: each room request holds only the room code, the nickname, the word count and a random member id. Pinned in Task K7.
6. **Audio that leaves the device.** Expected: during a recording and its transcription, the network log shows only the one model download. Pinned in Task K9.

---

## Part K: Only in Vlo (four pull requests)

Pull request K-A: Tasks K1 to K4. K-B: Tasks K5 and K6. K-C: Tasks K7 and K8. K-D: Tasks K9 and K10. Each one merges alone.

### Task K1: Poetry forms (F56)

**Files:** Create `src/features/craft/forms.ts`, `src/features/craft/FormCheck.tsx`, `tests/unit/forms.test.ts`, `tests/fixtures/forms/*`. Modify `src/lib/db.ts` (`Item.form?`), `src/features/craft/craftStore.ts`, `src/features/craft/CraftLabels.tsx`, `src/features/editor/Editor.tsx`, `src/features/editor/EditorPane.tsx`, `src/features/backup/file.ts`, `src/features/help/help.ts`.

**Interfaces:**

- Produces: `PoemForm = 'sonnet' | 'villanelle' | 'ghazal' | 'haiku' | 'pantoum' | 'sestina'` and `Item.form?: PoemForm`.
- Produces: `checkForm(form, stanzas: readonly (readonly string[])[], scans: readonly LineScan[] | null): FormNote[]`, with `FormNote = { line: number | null; kind: 'count' | 'rhyme' | 'refrain' | 'endword' | 'syllables' | 'meter'; message: string }`. `scans` is null in a language other than English, and then the check does structure and refrains only.

- [x] Tests first: each fixture gives 0 notes; a sonnet of 13 lines gives one count note; a villanelle with a changed refrain names the line; a sestina with a wrong end word names the stanza; a pantoum with a broken repeat names both lines; a haiku of 5-8-5 names line 2; a ghazal whose second line does not end with the refrain names the couplet; a Hebrew poem gets structure notes and no rhyme notes.
- [x] A "Form" select with the Craft labels of a poem (More tools, then Craft labels). The notes show as a short list under it, and each note moves the cursor to its line. A form with no notes shows one line of text, with no badge.
- [x] The form round trips through save, reload, backup, import and sync. Commit.
- Built: meter drift is a syllable check. A line whose syllables differ from the measure of the form, or of most lines, by more than 2 gets a note. A stress check for each line marked correct public-domain poems, because poets turn feet on purpose.

### Task K2: Versions (F55)

**Files:** Create `src/features/versions/versions.ts`, `src/features/versions/VersionsPanel.tsx`, `src/features/versions/paragraphDiff.ts`, `tests/unit/versions.test.ts`, `tests/e2e/versions.spec.ts`. Create `src/ui/segmented.tsx`. Modify `src/lib/db.ts` (table `itemVersions`, `Item.versionName?`, database version 10), `src/features/sync/clock.ts`, `src/features/sync/blobs.ts`, `src/features/sync/engine.ts`, `src/features/backup/file.ts` (backup version 5), `src/features/backup/backup.ts`, `src/features/binder/items.ts`, `src/features/library/projects.ts`, `src/features/snapshots/snapshots.ts`, `src/features/editor/EditorPane.tsx` (the History dialog), `src/features/help/help.ts`.

**Interfaces:**

- Produces: `ItemVersion = { id; projectId; itemId; name; createdAt; updatedAt; state: Uint8Array; text: string }`. The item's own text is the active version, and `Item.versionName` names it ("Main" when absent).
- Produces: `saveVersion`, `switchVersion`, `renameVersion`, `deleteVersion`, `undoDelete` and `takeBlock`. Each change of the live text goes through `applyState` of the snapshot restore path, with `KEEP_AI_MARKS`.
- Produces: `paragraphDiff(a: string[], b: string[])`: the paragraphs of two versions aligned by LCS, each pair marked same, changed, only in A or only in B.

- [x] Tests first: a switch and a switch back give the same Yjs text and marks; a switch takes a snapshot "Before switch"; "Use this" changes only its paragraph; a delete of the active version is not possible; versions round trip through backup, import and a two-device sync; the word count, the search, the exports and the AI read the active version only.
- [x] The Versions tab of the History dialog: the list of versions, "Save the text now as a version", Switch to this, Rename, Delete (with Undo) and Compare. Compare lists only the paragraphs that differ, each with the text now above the other version, in one column on every screen.
- [x] `versions.spec.ts`: save a version, edit, switch, compare, use one paragraph, reload, and the text is right; axe passes. Commit.
- Built: Versions sit in History, next to Snapshots, because both keep earlier text. Each version syncs in its own `version:<id>` blob, so the rows blob stays under the relay's limit.

### Task K3: Table read (F58)

**Files:** Create `src/features/editor/readAloud/dialogue.ts`, `src/features/editor/readAloud/cast.ts`, `tests/unit/dialogue.test.ts`, `tests/e2e/table-read.spec.ts`. Modify `src/features/editor/readAloud/reader.ts`, `src/features/editor/readAloud/sentences.ts`, `src/features/editor/toolbar/panels/ReadAloudPanel.tsx`, `src/features/editor/commands/registry.ts`, `src/features/help/help.ts`.

**Interfaces:**

- Produces: `speakersOf(paragraphs, match): Segment[][]` with `Segment = { from; to; speaker: string | null }`. `speaker` is a Codex entry id, or null for the narrator. `castSentences(doc, match, voiceOf)` gives the sentences with a voice for each, and `startReading(editor, cast?)` reads them.
- Consumes: `localVoices`, `findLocalVoice` and the sentence reader of `reader.ts`. Voice choices are in `localStorage` under the project id.

- [x] Tests first: straight and curly quotes, a quote that runs over two paragraphs, "said Mara" and "Mara said", an alias, a two-person exchange with no names, a quote with no speaker, nested single quotes, and French and German quote marks.
- [x] A "Table read" switch in the Read aloud panel, when the Codex has characters. It lists each character that the text names, each with a voice select. The main voice is the narrator's. Read, Pause and Stop, the mark on the sentence that plays, and the message for no on-device voice are the ones of read aloud. Commit.
- Built: the table read is part of the Read aloud panel, so the writer has one place for read aloud. A character with no choice gets one of the other voices in turn. The sample button is not built: the first sentence of a read is the sample.

### Task K4: Reader panel (F61)

**Files:** Create `tests/unit/reader-panel.test.ts`. Modify `src/features/ai/reader.ts`, `src/features/ai/prompts.ts`, `src/features/ai/request.ts`, `src/features/ai/AssistantPanel.tsx`, `src/lib/db.ts` and `src/features/codex/codex.ts` (the Codex comments), `src/features/help/help.ts`, `src/features/policy/privacy.ts` and `docs/privacy.md` (privacy version 3), `tests/unit/ai-request.test.ts`, `tests/e2e/assistant.spec.ts`.

**Interfaces:**

- Produces: `ReaderAction` and `ResultKind` get `'panel'`. `codexContext(entries, text): string` gives the notes of the entries that the text names, at most 600 tokens. `privateRequest` then gives the private names their aliases in the whole request, notes included. `splitPanel(text)` gives the notes of each reader.

- [x] Tests first: the request holds only the named entries; a private name in a note becomes its alias; the context stops at 600 tokens; a request for the in-browser model fits its 3,500-token limit; the answer splits into four cards by reader; no card has an Insert control.
- [x] "Reader panel" in the Assistant, with the four readers as four cards. The drawer shows the passage and the Codex notes before the request goes. Run the a11y and unit suites. Commit, then open pull request K-A.
- Built: the Reader panel is a Read action, so Co-writer mode has it too. Its cards have no Insert control in either mode.

### Task K5: The authorship record (F54)

**Files:** Create `src/features/authorship/record.ts`, `src/features/authorship/sourcePlugin.ts`, `src/features/authorship/keys.ts`, `tests/unit/authorship.test.ts`. Modify `src/lib/db.ts` (table `authorship`, database version 11), `src/features/sync/clock.ts`, `src/features/backup/file.ts` (backup version 6), `src/features/editor/Editor.tsx`, `src/features/export/ExportDialog.tsx`.

**Interfaces:**

- Produces: `AuthorshipEntry = { id; projectId; device: string; seq: number; at: number; minutes: number; typed: number; pasted: number; dictated: number; ai: number; deleted: number; words: number; prev: string; hash: string; sig: string }`. `device` is the SHA-256 of the device's public key. `seq` and `prev` make one chain for each device.
- Produces: `sourcePlugin`: it counts the characters of each transaction by source (typed, paste or drop, dictation, AI insert, delete) and skips changes from Yjs, undo of a remote change and snapshot restores. `flushEntry(projectId)` adds an entry when a session ends, when the page hides, and every 10 minutes of writing with changes.
- Produces: `exportRecord(projectId): Blob`, the file `<project> authorship record.json` with the entries and each device's public key as JWK.

- [ ] Tests first: typing, a paste, a drop, an AI insert and a delete count in the right field; a sync change counts nothing; each entry links to the one before; two devices give two chains that both check; the record round trips through backup, import and sync; the file holds no text and no titles.
- [ ] "Authorship record" in the Export dialog (all modes), with one line on what it holds. Commit.

### Task K6: The check page (F54)

**Files:** Create `src/features/authorship/VerifyPage.tsx`, `src/features/authorship/verify.ts`, `tests/unit/verify.test.ts`, `tests/e2e/verify.spec.ts`, `docs/authorship-record.md`. Modify `src/app/routes.tsx`, `src/features/help/help.ts`.

**Interfaces:**

- Produces: `verifyRecord(json: string): Promise<VerifyResult>`, with `VerifyResult = { ok: true; devices; totals; first; last } | { ok: false; reason; entry: number | null }`.

- [ ] Tests first: a good record passes; a change of each byte of a small record fails (a loop over every byte); a removed entry, two swapped entries and a new key with a good chain each fail or show the new key; a file that is not JSON fails with a clear reason.
- [ ] `/verify` takes a file by drop or by picker and shows the result: totals by source, the time span, each device key as a short fingerprint, and what the check proves and does not prove. It works offline. `docs/authorship-record.md` gives the format and the steps, so anyone can check a record with no Vlo code.
- [ ] `verify.spec.ts`: export a record, check it, change one byte, check again; axe passes in each theme. Commit, then open pull request K-B.

### Task K7: Sprints, challenges and rooms (F60)

**Files:** Create `src/features/sprints/sprint.ts`, `src/features/sprints/room.ts`, `src/features/sprints/RoomPanel.tsx`, `src/features/progress/MonthCalendar.tsx`, `supabase/migrations/0006_rooms.sql`, `tests/unit/sprints.test.ts`, `tests/e2e/sprints.spec.ts`. Modify `src/lib/db.ts` (`Session.target?`, `Project.settings.challenge?`), `src/features/focus/SessionTimer.tsx`, `src/features/progress/ProgressPage.tsx`, `src/lib/net.ts` (purpose `room`), `docs/privacy.md`.

**Interfaces:**

- Produces: `Session.target?: number`. `Project.settings.challenge?: { month: 'YYYY-MM'; target: number }`.
- Produces: SQL functions `room_create`, `room_join`, `room_post` and `room_state`, with the limits of decision K7, a check on each value, and the daily cleanup of migration 0003.
- Produces: `createRoom()`, `joinRoom(code, nickname)`, `postWords(words)` and `roomState()`. The panel polls every 15 seconds while a sprint runs and stops when it ends.

- [ ] Tests first: a sprint result counts only the words of its time; the month calendar sums `wordsByDay` for the month; each room request body holds only the allowed fields; a full room and an old code give a clear message; the SQL limits hold in the migration test.
- [ ] The session timer gets a word target and a result card with a short pulse on success (Part J0). Progress gets "Start a month challenge" and the calendar. "Sprint with friends" shows only when the build has a Supabase URL. Commit.

### Task K8: Series (F59)

**Files:** Create `src/features/series/series.ts`, `src/features/series/SeriesPage.tsx`, `tests/unit/series.test.ts`, `tests/e2e/series.spec.ts`. Modify `src/lib/db.ts` (table `series`, `CodexEntry.seriesId?`, database version 12), `src/features/codex/*`, `src/features/editor/extensions/codexNames.ts`, `src/features/analysis/style.ts`, `src/features/library/*`, `src/app/routes.tsx`, `src/features/sync/*`, `src/features/backup/file.ts` (backup version 7).

**Interfaces:**

- Produces: `Series = { id; title; projectIds: string[]; styleSheet: StyleRule[]; updatedAt }` with `StyleRule = { use: string; avoid: string[]; note?: string }`.
- Produces: `codexFor(projectId)`: the project's own entries and the shared entries of its series. Every reader of the Codex moves to it.
- Produces: the style check kind `'sheet'`: a word in `avoid` gets a note that names `use`.

- [ ] Tests first: a shared entry shows in each book and its names mark in each editor; a book that leaves the series keeps a copy of each shared entry it uses; the style sheet marks an avoided form in each book; a backup of one book holds the series row and the shared entries, and its import into a fresh browser makes the series again; a two-device sync keeps the series.
- [ ] "Make a series" and "Add to series" in the Library. The Series page: the books in order (drag to reorder), the words of each book and of all, the shared Codex, the style sheet and the mentions table across the books. Commit, then open pull request K-C.

### Task K9: Memoir voice capture (F57)

**Files:** Create `src/features/voice/prompts.ts`, `src/features/voice/RecordDialog.tsx`, `src/features/voice/recorder.ts`, `src/features/voice/transcribe.worker.ts`, `src/features/voice/model.ts`, `tests/unit/voice.test.ts`, `tests/e2e/voice.spec.ts`. Modify `package.json`, `src/lib/db.ts` (`ResearchFile.itemId?`), `src/features/research/*`, `src/features/settings/*`, `vite.config.ts` (WASM files out of the precache), `docs/licenses.md`, `docs/privacy.md`.

**Interfaces:**

- Produces: `PROMPTS`: 60 questions in 6 life stages, Vlo's own words.
- Produces: `transcribe(audio: Blob, language?: string): Promise<string>` in a worker. The model files come through `vloFetch` with purpose `model-download` into Cache Storage, and Transformers.js reads them only from there (`allowRemoteModels = false`). The ONNX Runtime WASM files are served from Vlo's own host.

- [ ] Tests first: the prompt deck has no repeated question; a recording saves as a research file of the memory and goes in backups; with the model off, no request goes; a fake model in the worker turns a fixture into its text; the text goes in at the cursor and counts as dictated in the authorship record; "Delete the model" frees the cache.
- [ ] "Record a memory" in a memory item: a question card with Next and Shuffle, Record and Stop with a level meter, and the saved clips with Play and "Turn into text". The first "Turn into text" asks to download the model and shows its size. Check the model by hand on a real recording in Chrome and Safari. Commit.

### Task K10: Gate 11 and the release

- [ ] Update STATUS, the roadmap doc's feature table, the help page, `docs/privacy.md` and `docs/licenses.md`. Run `npm run typecheck`, `lint`, `format:check`, `test`, `build`, `size` and the Chromium and phone suites. Expected: PASS.
- [ ] A fresh review agent that has not seen the implementation reviews the Phase 11 diff against Review Focus 1 to 6. Fix each high finding.
- [ ] Open pull request K-D. Ask the product owner to run "Run workflow" for all 4 browsers.
