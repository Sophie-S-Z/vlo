# Phase 9: Devices and Feedback

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A writer can revise with tracked changes, send a Word file to an editor and take the editor's changes back, collect structured feedback from beta readers, and write on two devices with no account. This phase builds the roadmap's "Devices and feedback" features: F44, F45, F49 and F50. Repository Phase 8 built roadmap Phase 7, so this repository phase is roadmap Phase 8.

**Architecture:** Suggestions are a mark in the item's Yjs document, as comments are (Phase 8 H3), so save, tab sync, snapshots, backups and imports carry them with no new table. The Word round trip extends the DOCX export and reads an editor's file back onto the original items through the Yjs text, as "Mark all" does (`src/features/people/markAll.ts`). The beta reader loop extends the sealed share comments of ADR 0004, so the server does not change. Sync seals one blob for each item text and one for the rows of each project, and a Supabase relay keeps only the newest blob of each device (ADR 0008, new).

**Tech Stack:** TipTap marks and a ProseMirror plugin, Yjs, Dexie 4 DBCore middleware, the `docx` package (`InsertedTextRun`, `DeletedTextRun`, `Bookmark`, comments), JSZip, Web Crypto, Supabase Postgres functions tested in PGlite, Vitest, Playwright. One new package: `uqr` for the pairing QR code (decision R7).

**Spec and sources:** the roadmap doc ("Vlo roadmap: beat every writing app", F44, F45, F49, F50, the design rules and decisions D1, D2 and D4), `docs/VLO_SPEC.md` sections 5, 9, 11, 12 and 15, ADR 0001, ADR 0003 and ADR 0004, `docs/sharing-setup.md`, `docs/STATUS.md`, `docs/plans/phase-8.md`.

**Already done:** comments in the text (`extensions/comment.ts`) with `{ id, text, at }`. Share links with sealed reader comments on one block (`share/comments.ts`, `ReaderComment` version 1). The DOCX export through `export/docx.ts` from the export tree. Word import of text, headings and footnotes (`import/docx.ts`). Edits of stored Yjs text with no editor, sent to open tabs (`markAll.ts`, `sendToTabs`). Snapshots with a label (`takeSnapshot`). PGlite tests for the migrations (`tests/unit/migrations.test.ts`). The keepalive workflow for the free Supabase plan.

**Not in this phase:** real-time co-writing (decision D2, kept out). Formatting changes and paragraph splits or joins as suggestions (decision R1). App text in other languages (decision D3). Sync of snapshots, sound files, the network log and share keys.

## Decisions for the product owner

| # | Topic | Recommendation | Other choice |
| --- | --- | --- | --- |
| R1 | Revision mode and suggestions (F44) | One mode, "Track changes", for each project. While it is on, typed and pasted words show as inserts and deleted words show as struck through, in the color of the current revision pass (Pass 1 to 5). The Changes panel lists them, and the writer accepts or rejects one change, one pass or all. Formatting, Enter and a join of two paragraphs apply at once and are not suggestions. | Two modes: Scrivener's revision colors with no accept or reject, and a separate suggest mode. |
| R2 | What other tools see while suggestions wait | Exports, shares, word counts, search and AI requests use the text as if every suggestion were accepted. The Word export can keep them as Word tracked changes instead (F45). | The text as if every suggestion were rejected. |
| R3 | An editor's Word file (F45) | "Import an editor's changes" takes a DOCX that Vlo exported. Each tracked change and each comment goes back onto its item as a suggestion or a comment with the editor's name, on the paragraph that still has the same text. Vlo lists each change that it cannot place, and changes nothing in silence. A snapshot of each item comes first. | A word diff of the whole file. It also catches changes the editor did not track, but it suggests undoing each change the writer made after the export. |
| R4 | Beta reader loop (F50) | A link can ask the readers up to 5 questions, shown after the text. A reader selects words and adds a comment, a reaction (Loved it, Funny, Moved me, Lost, Bored, Not convinced) or both. A Feedback tab (Full level) lists the replies of every link of the project by item. "Show in text" selects the words, and "Make a comment" puts the reply on them as a comment. | Reactions on a whole paragraph only, as comments are now, and no Feedback tab. |
| R5 | What syncs (F49) | Every project on the device: the text, the binder and every planning table (boards, timeline, people, codex, submissions), and research files up to 2 MB. Snapshots, sound files, the network log and share links stay on each device. | The writer picks each project that syncs. |
| R6 | Two devices change the same thing | The text merges word by word (Yjs), so no word is lost. Before a merge changes text that also changed on this device, Vlo takes a snapshot named "Before sync". For other rows, such as a synopsis or a card, the newest change wins. | Vlo asks the writer about each row that changed on both devices. |
| R7 | Pairing | Settings shows a QR code and a link. The phone camera opens the link, and the second device joins. The `uqr` package draws the code (MIT, no dependencies, about 8 KB gzip, loaded only in the pairing dialog). | A link to copy only, with no new package. |
| R8 | Relay limits | At most 5 devices and 100 MB of sealed data for each writer. Vlo deletes the data of a sync that has had no use for 90 days. | 3 devices and 50 MB, so more writers fit in the free 500 MB. |
| R9 | Supabase (D4) | Build and test everything against PGlite now. Sharing, beta readers and sync turn on in the build when you give the Supabase URL and anon key (`docs/sharing-setup.md`, steps 1 to 4). | Wait with F49 and F50 until the keys exist. |

## Packages

- `uqr` 0.1.3, MIT, for the QR code (decision R7). Add it to `docs/licenses.md`.

## Global Constraints

- Everything in the Phase 0 to 8 plans' Global Constraints still holds: only `src/lib/net.ts` makes requests, Pen mode sends no AI request, WCAG 2.2 AA in each theme, and each budget in spec section 12.
- Never lose a word (roadmap rule 1). Each feature that stores data gets a test for save, reload, backup and import.
- Simple first (roadmap rule 2). Track changes is in More tools and the command menu. The Feedback tab shows at the Full level, and the command menu opens it at every level.
- New marks and attributes raise `DOC_SCHEMA` to 7 once, in Task I1. Sync carries the schema in each blob, and a device never applies a blob newer than its own schema.
- The keystroke budget (50 ms p95) holds with Track changes on. The plugin reads only the steps of each transaction.
- Initial JavaScript stays under 250 KB gzip (216 KB now). The Changes panel, the review import, the Feedback tab, the sync engine and the pairing dialog load on use. The Dexie middleware is the only sync code on start.
- The relay and Supabase see sealed data only. Blob keys are HMACs, so the server sees no project or item id.
- Each request has its network purpose (`share` or the new `sync`), and the network log shows it.
- No suggestion, comment or Codex text goes in an AI request or a share. A Word export holds comments and tracked changes only when the writer turns them on.

## Review Focus

1. **A sync merge that loses words.** Expected: two devices edit the same scene offline, sync, and both texts are in the scene on both devices, with a "Before sync" snapshot on the device whose merge joins the two texts. Pinned in Task I6.
2. **A device with an older Vlo.** Expected: it does not apply a blob with a newer schema, it shows "Update Vlo on this device to sync", and it keeps its own text. Pinned in Task I6.
3. **A memoir real name that leaves through a deleted word or a comment.** Expected: a Word export with tracked changes or comments runs the name check on deleted text and comment text too, and a share holds neither. Pinned in Task I2.
4. **An editor's file that does not match.** Expected: a change on a paragraph that the writer changed after the export is listed, not placed, and the rest of the item gets its changes. Pinned in Task I3.
5. **A hostile reader reply.** Expected: `parseComment` refuses an unknown reaction, a range outside the block, a too-long answer or a wrong question index, and the Feedback tab never shows it. Pinned in Task I4.
6. **Track changes that slows typing.** Expected: the keystroke test on the 10,000-word scene passes with Track changes on. Pinned in Task I1.

---

## Part I: Devices and feedback (three pull requests)

Pull request I-A: Tasks I1 to I3 (no server). I-B: Task I4. I-C: Tasks I5 to I8. Each one merges alone.

### Task I1: Track changes and revision passes (F44)

**Files:** Create `src/features/editor/extensions/suggestion.ts`, `src/features/editor/ChangesPanel.tsx`, `tests/unit/suggestion.test.ts`, `tests/e2e/track-changes.spec.ts`. Modify `src/features/editor/Editor.tsx`, `src/features/editor/docSchema.ts` (`DOC_SCHEMA` 7), `src/features/editor/extensions/comment.ts` (`by`), `src/features/editor/leafText.ts` and `itemText.ts` (accepted text), `src/features/export/read.ts` (accepted text), `src/features/editor/commands/registry.ts`, `src/lib/db.ts` (`Project.settings.tracking?`), `src/features/backup/file.ts` (check it), `src/styles/editor.css` and the theme tokens (`--pass-1` to `--pass-5`), `src/features/help/help.ts`.

**Interfaces:**

- Produces: the `suggestion` mark with `{ id: string; kind: 'insert' | 'delete'; pass: 1 | 2 | 3 | 4 | 5; at: number; by: string }`. `inclusive: false`. No HTML parse rule, so a paste never carries a suggestion. `by` is empty for the writer.
- Produces: the `comment` mark gains `by: string` (default empty), for Word comments in Task I3.
- Produces: `Project.settings.tracking?: { on: boolean; pass: 1 | 2 | 3 | 4 | 5 }`.
- Produces: commands `acceptChange(id)`, `rejectChange(id)`, `acceptAll(pass?)`, `rejectAll(pass?)`; `changesOf(state): ChangeEntry[]` with `ChangeEntry = { id; kind; pass; by; at; from; to; text }` in text order.
- Produces: `acceptedText(node: ProseMirrorNode): string`, the text with each delete suggestion left out. Counts, `itemTexts`, search and the export reader use it.

- [ ] Tests first: with tracking on, typed words get an insert mark of the current pass; Backspace over old words marks them deleted and moves the caret before them; Backspace over the writer's own pending insert removes it for real; a paste gets an insert mark; Enter splits at once; a change from another tab (the y-sync meta) gets no mark; accept of a delete removes the words, reject of an insert removes them, accept of an insert and reject of a delete only take the mark off; `acceptAll(2)` leaves pass 1 waiting; `acceptedText` leaves out deleted words, so the word count does not count them; a backup round trip keeps every mark.
- [ ] An `appendTransaction` plugin in `suggestion.ts` turns the steps of each local transaction into marks while tracking is on. It skips transactions with the y-sync meta, so undo, tab sync and remote edits never get a mark. A deleted slice that is not a pending insert goes back in with a delete mark. Inline atoms that take no marks delete at once.
- [ ] "Track changes" in More tools and the command menu, with the pass picker. The Changes panel lists each change with its pass color, the words and Accept and Reject. Pass colors meet 3:1 for the underline and the strike in each theme.
- [ ] `track-changes.spec.ts`: turn tracking on, type and delete, reload, accept one and reject one, and the text is right; axe passes in each theme; the keystroke budget holds with tracking on. Commit.

### Task I2: Word export with comments and tracked changes (F45, part 1)

**Files:** Modify `src/features/export/model.ts` (`Run` gains `comment?` and `change?`, `ExportSection.id` stays the item id), `src/features/export/read.ts`, `src/features/export/docx.ts`, `src/features/export/ExportDialog.tsx`, `src/lib/privacy.ts` (`nameCheck` reads deleted text and comments), `tests/unit/docx-export.test.ts`, `tests/unit/privacy.test.ts`, `tests/e2e/export.spec.ts`.

**Interfaces:**

- Consumes: the `suggestion` and `comment` marks (Task I1).
- Produces: `ExportRequest.review?: { changes: boolean; comments: boolean }`. Only a Word export reads it. The text runs carry `change` and `comment`, so `toDocx` needs no new option.
- Produces: `bookmarkName(itemId)` in `model.ts`, the Word bookmark `vlo_<item id with no hyphens>` at the start of each section. The name is 36 characters, under Word's 40.

- [x] Tests first: a default DOCX has no `w:ins`, `w:del` or `w:comment`, and its text is the accepted text; with `changes: 'track'` the file has `w:ins` and `w:del` with the pass author and date; with `comments: true` `word/comments.xml` holds each comment and its range wraps its words; each section starts with its bookmark; a memoir export with tracked changes refuses an unmarked real name in deleted text or in a comment, as the name check does for the text.
- [x] Two switches in the Word part of the export dialog: "Keep my tracked changes" and "Include my comments". Both are off by default, and the dialog says that an editor can return the file with "Import an editor's changes". Commit.

### Task I3: Import an editor's changes (F45, part 2)

**Files:** Create `src/features/import/review.ts`, `src/features/import/placeReview.ts`, `src/features/import/ReviewImport.tsx`, `tests/unit/review.test.ts`, `tests/unit/place-review.test.ts`, `tests/e2e/word-round-trip.spec.ts`, `tests/fixtures/review.ts` (the changed Word file, made from its own XML as `tests/fixtures/import.ts` makes its files). Modify `src/features/project/ProjectPage.tsx` (command entry), `src/features/editor/CommentList.tsx` (the comment's author), `src/features/help/help.ts`.

**Interfaces:**

- Consumes: the bookmarks of Task I2; `openItemDoc`, `sendToTabs`, `takeSnapshot`; the marks of Task I1.
- Produces: `readReview(bytes: Uint8Array): Promise<Review>` with `Review = { sections: Map<string, ReviewParagraph[]>; foreign: boolean }` keyed by bookmark name, `ReviewParagraph = { original: string; changes: ReviewChange[] }`, and `ReviewChange = { kind: 'insert'; at; text; by; date } | { kind: 'delete'; from; to; by; date } | { kind: 'comment'; from; to; id; text; by; date }`. Offsets count in `original`: the paragraph text with deleted runs in and inserted runs out, one `NODE_MARK` for each footnote, equation or break. A reply on the same words joins its comment's text.
- Produces: `placeChanges(doc, paragraphs, pass, now): { tr: Transform; placement: Placement }` and `placeReview(target: { item; form; pass; language? }, paragraphs): Promise<Placement>` with `Placement = { changes: number; comments: number; unplaced: { quote: string; reason: 'changed' | 'missing' }[] }`.

- [x] Tests first: `readReview` gives the right offsets for an insert, a delete, a comment and a reply in the fixture; a file with no `vlo_` bookmark gives `foreign: true`; `placeReview` puts each change on a paragraph whose text equals `original` exactly (the export keeps every space, and an exact match keeps the offsets right), matched in order with `diffArrays` from `diff`; a paragraph that the writer changed after the export lists its changes as `changed` and leaves the paragraph as it was; a whole inserted paragraph goes in as a new paragraph with an insert mark; an editor's comment becomes a comment mark with `by`.
- [x] "Import an editor's changes" in the command menu. It takes a snapshot named "Before Word changes" of each item that it changes, then shows a summary: the changes placed, the comments placed and each change it could not place, with its words. A file that Vlo did not export gets "This file has no Vlo marks. Use Import writing to make a new project from it."
- [x] `word-round-trip.spec.ts`: export with comments and tracked changes, import the fixture that an editor changed, accept one change, reload, and the text and the comments are right. Commit, then open pull request I-A.

### Task I4: Beta reader loop (F50)

**Files:** Create `src/features/feedback/FeedbackPage.tsx`, `src/features/feedback/feedback.ts`, `src/features/reader/selection.ts`, `src/features/editor/storedDoc.ts`, `tests/unit/feedback.test.ts`, `tests/unit/reader-selection.test.ts`, `tests/e2e/feedback.spec.ts`. Modify `src/features/share/comments.ts`, `src/features/share/bundle.ts` (questions, `textOfBlock`), `src/features/share/share.ts`, `src/features/share/SharePanel.tsx`, `src/features/reader/ReaderPage.tsx`, `src/lib/db.ts` (`StoredComment` fields, `ShareRecord.questions?`), `src/features/import/placeReview.ts`, `src/features/editor/EditorPane.tsx`, `src/features/editor/commands/editorBus.ts`, `src/features/editor/extensions/findReplace.ts` (`findWords`), `src/app/routes.tsx`, `src/features/project/ViewTabs.tsx`, `src/features/project/ProjectPage.tsx`, `tests/unit/share-comments.test.ts`, `src/features/help/help.ts`.

**Interfaces:**

- Produces: `ReaderComment` version 2 = version 1 plus `start?: number; end?: number` (offsets in `textOfBlock(block)`, and `quote` is the text at the offsets), `reaction?: Reaction`, and `question?: number` with `text` as the answer. `REACTIONS = ['loved', 'funny', 'moved', 'lost', 'bored', 'unconvinced'] as const`, with `REACTION_LABELS`. `parseComment(value, limits: CommentLimits)` reads versions 1 and 2, with `CommentLimits = { questions: number; blocks?: string[][] }`: the reader's device knows the text of each block, and the writer's device checks the offsets against the quote. A version 2 comment needs `text`, a `reaction` or both.
- Produces: `ShareBundle.questions?: string[]`, at most `MAX_QUESTIONS = 5` of at most `MAX_QUESTION = 300` characters each, checked by `parseBundle`. `ShareInput.questions` and `ShareRecord.questions?`.
- Produces: `feedbackOf(shares: ShareRecord[], items: Item[]): FeedbackGroup[]` with `FeedbackGroup = { itemId: string | null; replies: { share: ShareRecord; comment: StoredComment }[] }`, in binder order, answers last with `itemId: null`. The section index maps to `ShareRecord.itemIds`. `makeComment(target, reply)` gives `'made' | 'missing' | 'taken' | 'newer'`.
- Produces: `changeStoredDoc(target: StoredTarget, change, snapshot?)` in `src/features/editor/storedDoc.ts`, which `placeReview` and `makeComment` share. `showWordsOnOpen(itemId, words)` in `editorBus.ts` makes the item's editor select the words when it opens.

- [x] Tests first: `parseComment` keeps a valid version 1 and version 2 comment and refuses an unknown reaction, `start > end`, an end past the block, a question index past the bundle's questions and an answer over `MAX_COMMENT`; `feedbackOf` groups replies by item in binder order; a share of 6 questions fails `parseBundle`.
- [x] The Share panel gets "Questions for your readers" (up to 5). The reader view selects words for a comment, offers the 6 reactions as toggle buttons with text labels, and shows the questions after the text with an answer field. The server and migrations do not change.
- [x] A Feedback tab (Full level, and in the command menu) reads every link's replies with `refreshComments`, groups them by item, and filters by reaction. "Show in text" opens the item and selects the quoted words when they are still there. "Make a comment" adds a comment mark with the reader's name as `by`.
- [ ] `feedback.spec.ts` with the fake relay of `tests/e2e/support/share.ts`: share with a question, react and answer as a reader, open Feedback, make a comment, reload, and the comment is on the words; axe passes in each theme. Commit, then open pull request I-B.

### Task I5: The sync relay (F49, server)

**Files:** Create `supabase/migrations/0005_sync.sql`, `docs/adr/0008-sealed-sync.md`, `tests/unit/sync-relay.test.ts`. Modify `src/features/share/rpc.ts` (`RpcName`), `src/lib/net.ts` (purpose `sync`, same host as `share`), `src/lib/db.ts` (`NetPurpose`), `docs/sharing-setup.md` (run 0005), `docs/privacy.md`.

**Interfaces:**

- Produces: tables `sync_spaces (id uuid, token_hash text, created_at, used_at)` and `sync_blobs (space_id, device text, key text, payload text, iv text, size int, updated_at timestamptz, primary key (space_id, device, key))`, closed by row level security with no policies.
- Produces: functions `create_sync_space(p_token text) → uuid`, `sync_put(p_space uuid, p_token text, p_device text, p_key text, p_payload text, p_iv text) → timestamptz`, `sync_list(p_space, p_token, p_device, p_since timestamptz) → setof (device, key, payload, iv, updated_at)` with the blobs of the other devices at or after `p_since`, ordered by `updated_at` and cut after 8 MB, `sync_devices(p_space, p_token) → setof (device, updated_at, size)`, `sync_drop(p_space, p_token, p_device, p_key)`, `leave_sync(p_space, p_token, p_device)`, `delete_sync_space(p_space, p_token)`.
- Produces: limits (decision R8): a blob of at most 2.8 MB of base64, 100 MB for each space, 5 devices, 20 new spaces an hour for the project, 150 MB of sync for the whole project so share links keep their room, and a daily cleanup `cleanup_sync()` of spaces with no use for 90 days. A wrong token raises `unknown space`.

- [x] Tests first in PGlite: a wrong token gets no rows and changes nothing; a put replaces the device's blob for that key; `sync_list` gives the blobs after `p_since` and stops at 8 MB; a sixth device, a blob over the limit and a space over 100 MB fail with their own error codes; `leave_sync` deletes only that device's blobs; the cleanup deletes an old space.
- [x] ADR 0008: the design, the seal purpose `vlo:sync:v1`, HMAC keys, newest-wins rows, Yjs text, the 30-second read overlap that makes the cursor safe, and what stays on the device. Commit.

### Task I6: Sync on the device (F49)

**Files:** Create `src/features/sync/clock.ts`, `src/features/sync/blobs.ts`, `src/features/sync/engine.ts`, `src/features/sync/merge.ts`, `src/features/sync/space.ts`, `tests/fixtures/syncRelay.ts`, `tests/unit/sync-clock.test.ts`, `tests/unit/sync-merge.test.ts`, `tests/unit/sync-engine.test.ts`. Modify `src/lib/db.ts` (version 9: `syncClock`, the middleware), `src/lib/crypto.ts` (purpose `sync`, HMAC key), `src/app/App.tsx` (load the engine only when a sync space exists).

**Interfaces:**

- Produces: `SYNC_TABLES`, the tables of decision R5. A Dexie DBCore middleware adds `syncClock` to each read-write transaction on them and records `{ key: '<table>:<id>'; table; id; at; gone?: true }` for each put and delete. A range delete reads its keys first.
- Produces: `Version = { table; id; at; row? }` (no `row` is a delete), `RowsBlob = { v: 1; schema: number; projectId: string; rows: Version[] }` and `TextBlob = { v: 1; schema: number; projectId: string; itemId: string; update: string }`, sealed with purpose `sync`, keyed by `blobKey(keys, 'rows:' + projectId | 'text:' + itemId | 'file:' + researchId)` (HMAC-SHA256, base64url). A research file goes in a rows blob of its own, so a few large files cannot pass the relay's 2.8 MB limit of one blob.
- Produces: `mergeRows(local, remote): Plan` with `Plan = { take: Version[]; keep: Version[] }` (pure: the newest `at` wins, `wordsByDay` keeps the larger count of each day), `syncOnce(): Promise<SyncResult>` with `SyncResult = { pushed: number; pulled: number; blocked?: 'newer-schema' }`, and `startSync(): () => void`.
- Produces: `SyncSpace` in `src/features/sync/space.ts` (the shape of Task I7), `readSpace()` and `updateSpace(spaceId, changes)`. `tests/fixtures/syncRelay.ts` is a fake relay in memory for the unit tests and `sync.spec.ts`.

- [x] Tests first: the middleware records a put, a bulk put and a range delete in the same transaction, and a failed transaction records nothing; `mergeRows` takes the newer row, keeps a delete that is newer than the edit, and keeps an edit that is newer than the delete; two Yjs texts edited apart merge with both edits; a remote text that meets local changes takes a "Before sync" snapshot first; a blob with `schema` 8 sets `blocked` and applies nothing; a research file over 2 MB stays out of the rows blob.
- [x] `syncOnce` pushes the blobs changed since the last push, then pulls with the cursor 30 seconds back, skips its own device, merges rows in one Dexie transaction that records the remote `at`, writes texts with `writeItemUpdate`, sends them to open tabs with `sendToTabs`, and recounts the changed items. It runs on start, on focus, 30 seconds after a change, every 60 seconds while visible, and when the page hides. Commit.

### Task I7: Pairing and the Devices screen (F49)

**Files:** Create `src/features/sync/PairDialog.tsx`, `src/features/sync/PairPage.tsx`, `src/features/sync/DevicesSection.tsx`, `src/features/sync/space.ts`, `tests/unit/sync-space.test.ts`, `tests/e2e/sync.spec.ts`. Modify `src/features/settings/SettingsPage.tsx`, `src/app/routes.tsx` (`/pair`), `src/features/backup/SafetyBadge.tsx` and `safety.ts` (device count, "Synced 2 min ago"), `package.json` (`uqr`), `src/features/help/help.ts`.

**Interfaces:**

- Produces: `SyncSpace = { spaceId: string; key: string; token: string; deviceId: string; deviceName: string; cursor: string; pushedAt: number; syncedAt: number; blocked: boolean; names: Record<string, string> }` in `appMeta` under `sync`. Backups and exports leave it out. Each blob carries its device's name as `from`, so the Devices list names the other devices.
- Produces: `startSpace(name)`, `joinSpace(pairing, name)`, `leaveSync(space)`, `stopSyncEverywhere(space)`, `listDevices(space)`, `pairingLink(space)`, `readPairing(hash)` and `syncErrorText(error)` in `space.ts`. A round that finds the space deleted ends sync on that device.
- Produces: the pairing link `/pair#p=<base64url of space id, key and token>`. The pair page takes the fragment once and removes it from the address bar, as the reader view does.

- [x] Tests first: a pairing link round trip gives the same space; a damaged link gives "This pairing link is not complete."; `leaveSync` keeps every project on the device.
- [x] Settings gets "Devices": "Sync my writing" explains what goes to the relay, makes the space and shows the QR code and the link. The pair page asks for a device name and starts sync. The list shows each device and when it last synced. "Stop sync on this device" and "Stop sync on all devices" (with confirm) end it. With no Supabase keys the section says "Sync is not set up in this build." and sends nothing.
- [x] The safety badge counts the devices and shows the last sync.
- [x] `sync.spec.ts` with a fake relay in the test support: two browser contexts pair, both edit the same scene offline, go online, and both edits are in both; the device that joins the texts has a "Before sync" snapshot; the network log shows only `sync` requests with sealed bodies; axe passes in each theme. Commit.

### Task I8: Gate 9 and the release

- [ ] Update STATUS, the help page, `docs/privacy.md` and `docs/licenses.md`. Add the spec change rows: the v1 non-goal "cloud sync of manuscripts" is now sealed sync (decision D1), and `DOC_SCHEMA` 7. Run `npm run typecheck`, `lint`, `format:check`, `test`, `build`, `size` and the Chromium and phone suites. Expected: PASS.
- [ ] Add suggestions, Word comments and a synced device to the memoir leak test (Review Focus 3).
- [ ] A fresh review agent that has not seen the implementation reviews the Phase 9 diff against Review Focus 1 to 6. Fix each high finding.
- [ ] Open pull request I-C. Ask you to run "Run workflow" for all 4 browsers, and to give the Supabase keys (decision R9) when you want sharing, beta readers and sync on.
