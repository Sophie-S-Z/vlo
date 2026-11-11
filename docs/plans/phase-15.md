# Phase 15: Proof and reach

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Status:** the product owner approved roadmap 2 decisions R1 to R6 as recommended on 2026-11-10. Decision R1 puts this phase after Phase 14. Decision R4 makes the public timestamp opt-in OpenTimestamps, and decision R5 makes Spanish the second app language. The product owner approved decisions O1 to O8 as recommended on 2026-11-11.

**Goal:** A writer can prove to anyone when their authorship record existed, with no account and no cost. A Spanish reader uses Vlo in Spanish. Each release passes EPUBCheck on every EPUB that Vlo makes, and a 200,000-word book types and opens inside the budgets. This phase builds roadmap 2's F68, F69 and F70.

**Architecture:** Each feature reuses a part that Vlo has now. The timestamp is one more field of the record file, in the standard OpenTimestamps proof format, and only `src/lib/net.ts` sends its hash. The app text goes through one function, `t()`, with the English text as the key, so the code stays readable and the English build does not grow. The Spanish catalog is its own chunk, which only a Spanish page loads. The release checks extend the CI export job and the Gate 1 performance test.

**Tech Stack:** React, TipTap, Yjs, Dexie, Vitest, Playwright. No new runtime package.

**Spec and sources:** roadmap 2 (F68 to F70, and the risks "A public timestamp leaks data" and "Translation upkeep"), `docs/VLO_SPEC.md` sections 10, 12 and 15, `docs/authorship-record.md`, `docs/plans/phase-12.md` (F54, the authorship record), `docs/plans/phase-6.md` (Task F3, the budgets), the [OpenTimestamps](https://opentimestamps.org) proof format, `docs/STATUS.md`.

**Not in this phase:** text in exported files. A table of contents or a "Chapter" heading follows the book, so it stays as it is now. A third app language. A right-to-left layout. A timestamp of each entry of the record: one proof covers the whole record.

## Decisions for the product owner

| # | Topic | Recommendation | Other choice |
| --- | --- | --- | --- |
| O1 | What the proof covers (F68) | One SHA-256 of all the entries of the record, so the proof covers the chains of every device. "Download the record" gets an "Add a public timestamp" switch, off by default. The proof goes in the file, and the project stores nothing new. | The hash of the last entry only, which covers one device. |
| O2 | The proof code (F68) | Vlo's own small reader and writer of the OpenTimestamps format: the operations that a calendar server uses, and the pending and Bitcoin attestations. The file keeps the standard `.ots` bytes, so the `ots verify` program also checks it. | The `javascript-opentimestamps` library, which has the LGPL-3.0 license and is large. |
| O3 | Servers (F68) | The two free calendar servers `a.pool.opentimestamps.org` and `b.pool.opentimestamps.org`. Both allow requests from a browser. `/verify` asks before it finishes a pending proof at the calendar, and before it reads the block time from `mempool.space`. | One calendar server only. |
| O4 | The catalog (F69) | `t('Rename')`: the English text is the key, with `{name}` for a value and an English and a Spanish form for "1 word" and "2 words". A test fails when a `t()` text has no Spanish, or when the Spanish has a text that the code no longer uses. A lint rule fails on text in the page that does not go through `t()`. | Short ids such as `binder.rename`, or the i18next library. |
| O5 | Choosing the language (F69) | Settings gets "App language": Automatic, English or Español. Automatic follows the browser. A change reloads the page. The project language, its word count and the spelling check do not change. | A switch that changes the text with no reload. |
| O6 | The Spanish text (F69) | Claude writes neutral Spanish for Spain and Latin America, with "tú". A Spanish reader checks the help pages and the main screens by hand at Gate 15, as for the script PDF. | A paid translator. |
| O7 | Release checks (F70) | EPUBCheck in CI on each EPUB that the tests make: the rich text, the poem, the own font, the novel, the memoir, the poetry book, a script, a book with citations, and the 200,000-word book. The 200,000-word project holds the typing budget (p95 under 50 ms a key) and the open budget (300 ms) in Chromium. The 100,000-word tests stay. | Replace the 100,000-word project. |
| O8 | Pull requests | Six pull requests: O-A (F70), O-B (F68), then O-C to O-F (F69). Spanish shows in Settings only in O-F, when every screen has it. | One pull request for each feature. |

## Global Constraints

- Everything in the Phase 0 to 14 plans' Global Constraints still holds: only `src/lib/net.ts` makes requests, Pen mode sends no AI request, WCAG 2.2 AA in each theme, each budget in spec section 12, and the Part J0 UI and motion rules of `docs/plans/phase-10.md`.
- Never lose a word. A failed timestamp request never stops the download of the record. A missing translation shows the English text, and the test stops the release.
- Simple first. The timestamp is off until the writer turns it on. An English page loads no catalog.
- The network log names each timestamp request. The request holds the 32-byte hash and nothing else: no text, no title, no project id.
- The English text stays in ASD-STE100 Simplified Technical English. The Spanish text follows the same rules: short sentences, one meaning for each word.

## Review Focus

1. **A timestamp that leaks.** Expected: the calendar request body is the 32-byte hash, and the network log shows each request. `/verify` sends nothing until the reader agrees. Pinned in Tasks O2 and O3.
2. **A proof that lies.** Expected: `/verify` computes the Bitcoin Merkle root from the hash and the proof itself, and shows a date only when the block header agrees. A changed entry, a changed proof or a pending proof shows no date. Pinned in Task O3.
3. **A screen with English left in it.** Expected: the lint rule and the catalog test fail on any text outside `t()` and on any `t()` text with no Spanish. A browser test opens each main screen in Spanish and finds no English sentence. Pinned in Tasks O4 and O8.
4. **A Spanish layout that breaks.** Expected: Spanish text is about a quarter longer. Each main screen at 320 px and at 1280 px has no text cut off and no sideways scroll, and axe finds no serious issue. Pinned in Task O8.
5. **A budget that holds only at 100,000 words.** Expected: the 200,000-word project types under 50 ms at p95 and opens its long scene in under 300 ms in Chromium. Pinned in Task O1.

---

## Part O: Proof and reach (six pull requests)

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

### Task O4: The catalog (F69), pull request O-C

**Files:** Create `src/lib/i18n.ts`, `src/locales/es.ts`, `tests/unit/i18n.test.ts`, `eslint-rules/no-page-text.js`. Modify `eslint.config.js`, `src/main.tsx`, and the app shell, Library and Settings screens.

**Interfaces:**

- Produces: `t(text, values?)`, `tn(count, one, other, values?)`, `appLocale()`, and `loadAppLanguage()`, which runs before the first render.

- [ ] Tests first: `t()` gives the Spanish text and puts each value in place; `tn()` picks the form; the catalog test finds each `t()` text in the source and fails on a missing or an extra Spanish text; dates and numbers use the app language.
- [ ] The lint rule covers the converted folders. Commit.

### Tasks O5 to O7: Every screen in the catalog (F69), pull requests O-D and O-E

**Files:** The remaining screens, in two groups: O-D is the editor, the binder, the Codex, the Plot Grid and the outline; O-E is export, the book, sharing, sync, the AI panels, the memoir, the series and the scripts. Each pull request widens the lint rule to its folders.

- [ ] Each string of the group goes through `t()` or `tn()`, with its Spanish. The lint rule and the catalog test pass. The English text does not change. Commit for each group.

### Task O8: Help in Spanish, and the language setting (F69), pull request O-F, and Gate 15

**Files:** Modify `src/features/help/help.ts`, `src/features/settings/SettingsPage.tsx`, `src/locales/es.ts`, `eslint.config.js` (the rule covers all of `src`). Create `tests/e2e/spanish.spec.ts`.

- [ ] Tests first: Automatic follows the browser; a choice holds after a reload; each main screen in Spanish has no English sentence, no cut-off text at 320 px and 1280 px, and no serious axe issue.
- [ ] Gate 15: run `npm run typecheck`, `lint`, `format:check`, `test`, `build`, `size` and the Chromium and phone suites. A fresh review agent reviews the Phase 15 diff against Review Focus 1 to 5. Ask the product owner to run "Run workflow" for all 4 browsers, and to have a Spanish reader check the help and the main screens by hand.
