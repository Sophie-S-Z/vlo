# Phase 15: Proof and scale

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Status:** the product owner approved roadmap 2 decisions R1 to R6 as recommended on 2026-11-10. Decision R1 puts this phase after Phase 14. Decision R4 makes the public timestamp opt-in OpenTimestamps. The product owner approved decisions O1 to O8 as recommended on 2026-11-11. On 2026-11-11 the product owner then took F69 (Spanish, decision R5) out of the phase: no writer of Vlo writes in Spanish now. Decisions O4 to O6 and Tasks O4 to O8 went with it.

**Goal:** A writer can prove to anyone when their authorship record existed, with no account and no cost. Each release passes EPUBCheck on every EPUB that Vlo makes, and a 200,000-word book types and opens inside the budgets. This phase builds roadmap 2's F68 and F70.

**Architecture:** Each feature reuses a part that Vlo has now. The timestamp is one more field of the record file, in the standard OpenTimestamps proof format, and only `src/lib/net.ts` sends its hash. The release checks extend the CI export job and the Gate 1 performance test.

**Tech Stack:** React, TipTap, Yjs, Dexie, Vitest, Playwright. No new runtime package.

**Spec and sources:** roadmap 2 (F68 to F70, and the risks "A public timestamp leaks data" and "Translation upkeep"), `docs/VLO_SPEC.md` sections 10, 12 and 15, `docs/authorship-record.md`, `docs/plans/phase-12.md` (F54, the authorship record), `docs/plans/phase-6.md` (Task F3, the budgets), the [OpenTimestamps](https://opentimestamps.org) proof format, `docs/STATUS.md`.

**Not in this phase:** app text in another language (F69, taken out on 2026-11-11). A timestamp of each entry of the record: one proof covers the whole record.

## Decisions for the product owner

| # | Topic | Recommendation | Other choice |
| --- | --- | --- | --- |
| O1 | What the proof covers (F68) | One SHA-256 of all the entries of the record, so the proof covers the chains of every device. "Download the record" gets an "Add a public timestamp" switch, off by default. The proof goes in the file, and the project stores nothing new. | The hash of the last entry only, which covers one device. |
| O2 | The proof code (F68) | Vlo's own small reader and writer of the OpenTimestamps format: the operations that a calendar server uses, and the pending and Bitcoin attestations. The file keeps the standard `.ots` bytes, so the `ots verify` program also checks it. | The `javascript-opentimestamps` library, which has the LGPL-3.0 license and is large. |
| O3 | Servers (F68) | The two free calendar servers `a.pool.opentimestamps.org` and `b.pool.opentimestamps.org`. Both allow requests from a browser. `/verify` asks before it finishes a pending proof at the calendar, and before it reads the block time from `mempool.space`. | One calendar server only. |
| O7 | Release checks (F70) | EPUBCheck in CI on each EPUB that the tests make: the rich text, the poem, the own font, the novel, the memoir, the poetry book, a script, a book with citations, and the 200,000-word book. The 200,000-word project holds the typing budget (p95 under 50 ms a key) and the open budget (300 ms) in Chromium. The 100,000-word tests stay. | Replace the 100,000-word project. |
| O8 | Pull requests | Two pull requests: O-A (F70), then O-B (F68). | One pull request for each task. |

## Global Constraints

- Everything in the Phase 0 to 14 plans' Global Constraints still holds: only `src/lib/net.ts` makes requests, Pen mode sends no AI request, WCAG 2.2 AA in each theme, each budget in spec section 12, and the Part J0 UI and motion rules of `docs/plans/phase-10.md`.
- Never lose a word. A failed timestamp request never stops the download of the record.
- Simple first. The timestamp is off until the writer turns it on.
- The network log names each timestamp request. The request holds the 32-byte hash and nothing else: no text, no title, no project id.
- The English text stays in ASD-STE100 Simplified Technical English.

## Review Focus

1. **A timestamp that leaks.** Expected: the calendar request body is the 32-byte hash, and the network log shows each request. `/verify` sends nothing until the reader agrees. Pinned in Tasks O2 and O3.
2. **A proof that lies.** Expected: `/verify` computes the Bitcoin Merkle root from the hash and the proof itself, and shows a date only when the block header agrees. A changed entry, a changed proof or a pending proof shows no date. Pinned in Task O3.
3. **A budget that holds only at 100,000 words.** Expected: the 200,000-word project types under 50 ms at p95 and opens its long scene in under 300 ms in Chromium. Pinned in Task O1.

---

## Part O: Proof and scale (two pull requests)

### Task O1: Release checks at scale (F70), pull request O-A

**Files:** Create `tests/unit/epubcheck.test.ts`. Modify `tests/fixtures/generate-large.ts` (a word total as an input), `tests/fixtures/seed-entry.ts`, `tests/e2e/support/seed-bundle.ts`, `tests/e2e/performance.spec.ts`, `tests/unit/export-fixtures.ts`, `tests/unit/book-epub.test.ts`, `.github/workflows/ci.yml`, `docs/STATUS.md`.

- [x] Tests first: the generator gives 200,000 words with the same parts and the same 10,000-word scene; the same seed gives the same project.
- [x] The 200,000-word project holds the Gate 1 budgets of the 100,000-word project: it opens the long scene in under 300 ms and types under 50 ms at p95, with the same WebKit ceilings.
- [x] One EPUBCheck test runs on each EPUB that the export tests make, and CI fails on any error. Commit.
- Built: `epubcheck.test.ts` checks 9 EPUBs: the rich text, a poem, own fonts, the novel, memoir and poetry books, a script, an essay with citations, and the 200,000-word book. The book fixtures moved to `export-fixtures.ts`, so `book-epub.test.ts` and the check share them. Chromium on this machine: the 200,000-word project opens the scene in 150 ms and types at 18 ms p95, as the 100,000-word project does (135 ms and 19 ms).

### Task O2: Get a public timestamp (F68), pull request O-B

**Files:** Create `src/features/authorship/ots.ts`, `tests/unit/ots.test.ts`. Modify `src/lib/net.ts` (purpose `timestamp`), `src/lib/db.ts` (`NetPurpose`), `vercel.json` (CSP), `src/features/authorship/record.ts`, `src/features/authorship/RecordDownload.tsx`, `src/features/help/help.ts`, `docs/authorship-record.md`, `docs/privacy.md`.

**Interfaces:**

- Produces: `recordDigest(entries): Promise<Uint8Array>`, `stamp(digest): Promise<Uint8Array>` (the `.ots` bytes from the calendars), `readProof(bytes)` and `writeProof(proof)`.

- [x] Tests first: a proof that a calendar server gave reads and writes back to the same bytes; the request body is the 32-byte hash; a failed request still downloads the record with no proof; a version 1 record still checks.
- [x] "Add a public timestamp" in Export, off by default, with a line that says what leaves the device. Commit.
- Built: the record stays version 1 with an optional last field, `timestamp`, so a record with no timestamp is the same file as before and needs no new version. The proof starts from the SHA-256 of the record with no timestamp. Each pool gets the SHA-256 of that hash and 16 random bytes, so no server can match it to a record. The two pool answers in `tests/fixtures/ots/` are real answers.

### Task O3: Check the timestamp in `/verify` (F68), pull request O-B

**Files:** Modify `src/features/authorship/verify.ts`, `src/features/authorship/VerifyPage.tsx`, `src/lib/net.ts`, `vercel.json`. Extend `tests/unit/ots.test.ts`, `tests/e2e/verify.spec.ts`.

- [x] Tests first: a Bitcoin proof gives the block time when the header agrees; a changed entry, a changed proof or a wrong header gives no date; a pending proof says that Bitcoin has not confirmed it yet.
- [x] `/verify` asks before each request, and offers the finished record as a download. A browser test with routed servers, with axe. Commit.
- Built: one "Check the timestamp" button covers the calendar and the block server requests. The page explains both before the reader chooses it. A pending proof asks only the two calendars that finish the pools' proofs (alice and bob), so a proof cannot make the page send a request to another server.

### Gate 15

- [x] Run `npm run typecheck`, `lint`, `format:check`, `test`, `build`, `size` and the Chromium and phone suites. A fresh review agent reviews the Phase 15 diff against Review Focus 1 to 3. Ask the product owner to run "Run workflow" for all 4 browsers.
- Built: the review found no blocking defect, and Review Focus 1 to 3 hold. Its 7 minor findings are fixed: each timestamp request stops after 15 seconds, so a server that never answers cannot hold the download; a server error or a lost connection shows "Vlo could not reach the servers" and no longer reads as a failed proof; a pending or Bitcoin attestation with extra bytes fails, as in `ots verify`; `stampRecord` hashes the entries with `recordDigest`, so a second timestamp also passes; and the privacy notice (version 9), the check page and `docs/authorship-record.md` now name the servers that each check asks. `/verify` trusts mempool.space for the block header, and `docs/authorship-record.md` says so.
