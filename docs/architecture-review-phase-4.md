# Architecture review after Phase 4

Spec section 16 asks for an `improve-codebase-architecture` review after Phase 4. Plan decision S8 limits the fixes in Phase 5 to code that sharing also uses: the export tree, privacy, the network module and the crypto helpers. The other findings wait for Phase 6.

Scope: `src/features/export`, `src/lib/privacy.ts`, `src/lib/net.ts` and `src/features/ai`, reviewed on 2026-11-07 at commit `0d58dfb`.

## Findings fixed in Phase 5

1. **Four ways to read the text of a project's items.**
   - Export, backup, the AI marked names and "Mark all" each had their own rule for which items hold text and how many to open at once.
   - The AI marked names opened every item database at the same time.
   - Fix: `readItemUpdates(itemIds)` in `src/lib/ydocs.ts` opens at most `READ_AT_ONCE` (6) databases at once. `holdsText(template, kind)` in `src/features/library/templates.ts` holds the rule. Export, backup and the AI marked names use both. Sharing uses both.
   - "Mark all" keeps its own reader for now, because it writes as it reads.
2. **The privacy order was inside `prepareExport`.**
   - An outgoing tree has to follow a fixed order: build the tree, check the names on the real text, put the aliases in, then add the provenance page, which counts the aliased text.
   - `prepareExport` mixed that order with the manuscript and font steps, so a share bundle would have had to copy it.
   - Fix: `safeExportTree(input)` owns the order. `prepareExport` and the share bundle both call it. It is in `src/features/export/safeTree.ts`, so the Share panel does not load the PDF font code.
3. **The crypto and base64 helpers were private to `keys.ts`.**
   - Share links need base64url, a random raw key and gzip before encryption.
   - Fix: Task E2 moves the helpers to `src/lib/crypto.ts`. `keys.ts` keeps only its storage and the lockout.
4. **The host lists matched the CSP by hand.**
   - Comments said that `HOSTS` in `src/lib/net.ts` and the CSP `connect-src` in `vercel.json` agree, but no test checked it.
   - Fix: `tests/unit/vercel-config.test.ts` now checks that `connect-src` lists exactly the hosts of `HOSTS`, and that each AI preset goes to an allowed host.
   - The Supabase RPC calls get one module (`src/features/share/rpc.ts`, Task E1) that owns the URL, the headers and the error mapping.

## Findings for Phase 6

5. **People turn into `PrivatePerson` lists in more than one place.**
   - The export dialog reads `db.people` fresh. The Assistant panel uses its props and has a "still reading" guard.
   - The AI path must also add the marked names, because plain text loses the marks.
   - Proposal: a privacy module with two calls. One gives the project's current private people. The other gives an aliaser for plain text that collects the marked names itself and restores names in an answer.
6. **The export worker steps depend on their order.**
   - A caller must call prepare, then check, then make. The worker keeps the font check in module state, so a make without a check uses no fonts.
   - One `waiting` slot means that two overlapping sends replace each other's promise.
   - Proposal: let `ExportJob` take a message port, so a test can run it in the same thread. Make the steps a small state machine that refuses a step out of order.
7. **The AI request is built inside a React component.**
   - `AssistantPanel.tsx` collects the open item's text, then the passages, then the people. It then puts the aliases in, checks the size and checks the key.
   - Passages come from the stored plain-text copies, but marked names come from the Yjs updates.
   - Proposal: a request builder module that returns the aliased and size-checked request, or a message for the writer, with unit tests for the privacy order.

## Modules that pass the deletion test

`provenance.ts`, `privacy.ts`, `read.ts` and `model.ts` hide real work behind small interfaces. If one of them went away, its work would spread to its callers. `names.ts` and `projectNames.ts` are small and work together, and finding 5 would merge them into the privacy module.
