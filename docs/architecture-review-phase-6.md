# Architecture review in Phase 6

Spec section 16 asks for an `improve-codebase-architecture` review in Phase 6. Plan Task F1 runs it on all of `src/` and fixes the top findings. The findings are in order of risk to a writer: lost text first, then a real name that leaves the device, then upkeep.

Scope: all of `src/`, reviewed on 2026-11-08 at commit `582032d`, with findings 5 to 7 of `docs/architecture-review-phase-4.md`.

## Findings to fix in Phase 6

1. **The web originality check sends real names.**
   - "Check the web too" sends up to 6 phrases of 12 words to Wikipedia and OpenAlex (`analysis/panel/OriginalityTab.tsx`, `analysis/originality/match.ts` `searchPhrases`).
   - `searchPhrases` scores long and rare words highest, so a name such as "Rosalind" makes a phrase more likely to go.
   - The Insights panel gets no people, so no privacy step runs. No leak test covers this path.
   - Fix: in a project with private people, the check leaves out each phrase that holds a real-name variant or a marked name. A unit test checks that "Rosa" goes 0 times for the memoir fixture.
2. **People lists come from 3 places, with different rules when a read fails** (Phase 4 finding 5).
   - The export dialog and the Share panel each have a `currentPeople()` copy. When the Dexie read fails, both use the props, which `ProjectPage` gives as `people ?? []`. A share-safe export or a link can then go with no aliases.
   - The AI path does the opposite: it refuses to send while the people load.
   - Fix: one `privatePeople(projectId)` in `features/people/people.ts` reads the stored people and throws when the read fails. Export, Share, the AI request and the originality check use it. It stays out of `lib/privacy.ts`, which holds only pure text code.
3. **The AI request is built inside a React component** (Phase 4 finding 7).
   - `ai/AssistantPanel.tsx` collects the open item's text, the passages and the marked names, then puts the aliases in and checks the size. `ai/names.ts` and `ai/projectNames.ts` each have this one caller, which must call them in the right order. Only browser tests check that order.
   - Fix: `ai/request.ts` builds the aliased, size-checked request and its name restore step, or gives a message for the writer. The panel keeps its React state. Unit tests check the privacy order on the memoir fixture.

## Findings for a later release

4. **"Replace" import deletes the device copy before it stores the new one** (`backup/backup.ts` `importBackup`).
   - If a later write fails, the device holds neither version. The writer still has the backup file, and chose to replace the device copy, so the risk is a lost retry, not lost words.
   - Proposal: read the current project into memory first and put it back on failure. Refuse Replace while another tab has the project open.
5. **The export worker steps depend on their order** (Phase 4 finding 6, `export/export.worker.ts`).
   - The worker keeps `prepared` and `fonts` in module state, so a make with no check uses no own fonts. One `waiting` slot in `startExport.ts` lets a second send replace the first one's promise. The dialog runs one step at a time, so no writer meets this today.
   - Proposal: a job that refuses a step out of order and can run in the same thread for a unit test.
6. **The co-writer's Insert logic is inside the panel** (`AssistantPanel.tsx` `findTarget` and `insert`).
   - Only `assistant.spec.ts` tests the code that finds the words a rewrite replaces. Proposal: move it next to `insertAiText` in `editor/extensions/aiOrigin.ts`, with unit tests on built documents.
7. **"Mark all" has its own reader** (`people/markAll.ts`).
   - `scanProject` repeats the batching of `readItemUpdates`. Mark all changes item text but not each item's `updatedAt`, which the AI marked-name cache uses. This is harmless now, because Mark all marks only names that are already variants.
   - Proposal: `scanProject` uses `readItemUpdates` and `holdsText`, and Mark all updates each changed item's `updatedAt`.
8. **Two pass-through wrappers**: `holdsText` in `backup/file.ts` and `checkFonts` in `export/run.ts` only rename. Inline them when the code near them changes.

No finding goes against an ADR.

## Modules that pass the deletion test

`lib/privacy.ts`, `export/safeTree.ts`, `lib/ydocs.ts`, `lib/net.ts`, `lib/crypto.ts`, `share/rpc.ts`, `share/bundle.ts`, `export/read.ts`, `export/provenance.ts`, `export/model.ts`, `ai/assistantStore.ts`, `ai/reader.ts`, `ai/cowriter.ts`, `library/templates.ts`, `analysis/originality/match.ts`, `analysis/deep/score.ts` and `editor/commands/registry.ts` each hide real work behind a small interface. If one of them went away, its work would spread to its callers.
