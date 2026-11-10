# Phase 12: Pay the review debt

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Vlo fixes the five findings that the Phase 6 architecture review left for a later release (`docs/architecture-review-phase-6.md`, findings 4 to 8). The roadmap ended with Phase 11, so this phase adds no feature. It makes one path safer for the writer's words, and it makes four parts simpler to test and keep.

**Architecture:** Each fix stays inside the module that the review names. Replace import reuses `collectBackup` to keep the device copy in memory. The export job gets the one queue that the book preview had. The co-writer's target search moves next to `insertAiText`. Mark all reads through `readItemUpdates`. Two wrappers that only rename go.

**Tech Stack:** TypeScript, Dexie, Yjs, TipTap, Vitest. No new package.

**Spec and sources:** `docs/architecture-review-phase-6.md` (findings 4 to 8), `docs/STATUS.md`, spec section 9 (backup and import).

**Not in this phase:** the review's other proposal for finding 4, a refusal of Replace while another tab has the project open. The import error already tells the writer to close other Vlo tabs, and the device copy now comes back. The three low findings of Gate 11 stay open (`docs/plans/phase-11.md`, Task K10).

## Global Constraints

- Everything in the Phase 0 to 11 plans' Global Constraints still holds.
- Never lose a word (roadmap rule 1). A failed Replace import leaves the device copy as it was.
- No change to the database version, the backup version or any screen.

---

## Part L: Review debt (one pull request)

### Task L1: Replace import keeps the device copy (finding 4)

**Files:** Modify `src/features/backup/backup.ts`, `tests/unit/backup.test.ts`.

- [x] Test first: a Replace import whose row write fails leaves the project, its items, its text and its snapshots as they were before the import.
- [x] `importBackup` reads the device copy with `collectBackup` before the delete. A failed write of the backup stores the device copy again, then throws. The import and the restore share one `storeBackup`.

### Task L2: The export job runs one step at a time (finding 5)

**Files:** Modify `src/features/export/startExport.ts`, `src/features/book/BookPreview.tsx`. Create `tests/unit/export-job.test.ts`.

- [x] Tests first, with a stand-in worker: a second step waits for the answer to the first, and each caller gets its own answer; a failed step does not stop the next one; `close` stops the step on the way and each step after it.
- [x] `ExportJob.send` chains each step on a queue. The book preview drops its own queue.

### Task L3: The co-writer's target search leaves the panel (finding 6)

**Files:** Modify `src/features/editor/extensions/aiOrigin.ts`, `src/features/ai/AssistantPanel.tsx`, `src/features/ai/assistantStore.ts`, `tests/unit/ai-origin.test.ts`.

- [x] Tests first on built documents: the range stays while the words are there; the words are found again after text before them changed; the search reads across a bold run; the result is null when the words are gone, match twice, or span two blocks that moved.
- [x] `findTarget` and its `Target` type move to `aiOrigin.ts`. The store and the panel import them.

### Task L4: Mark all reads through the shared reader (finding 7)

**Files:** Modify `src/features/people/markAll.ts`.

- [x] `scanProject` reads with `readItemUpdates`. The list of text items uses `holdsText`, and the batch size is `READ_AT_ONCE`. The existing people tests pass with no change.
- Built: Mark all already updates the `updatedAt` of each changed item, so that part of the proposal needed no change.

### Task L5: Two pass-through wrappers go (finding 8)

**Files:** Modify `src/features/backup/file.ts`, `src/features/backup/backup.ts`, `src/features/export/run.ts`, `src/features/export/export.worker.ts`.

- [x] The callers use `holdsText` of `library/templates.ts` and `checkOwnFonts` of `export/fontCheck.ts`.

### Task L6: Gate 12

- [x] Update STATUS and the review doc. Run `npm run typecheck`, `lint`, `format:check`, `test`, `build`, `size` and the Chromium browser tests for export, the book preview, the Assistant, backup and people. Expected: PASS.
- [x] Open the pull request. Ask the product owner to run "Run workflow" for all 4 browsers.
- Built: in the build container, the unit suite passed except `docx-libreoffice.test.ts`, which fails on `main` too there. The CI job "Export files open in other apps" runs it. The 35 Chromium tests of export, the book preview, the Assistant, backup, import and people passed. Initial JavaScript: 224 KB gzip.
