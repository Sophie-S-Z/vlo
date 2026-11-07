# Phase 5: Sharing and Usage Counts Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A writer shares chosen items as an encrypted read-and-comment link with an expiry date, and can revoke it. A beta reader opens the link on a phone with no install and no account, reads, and comments. The server holds only ciphertext. A writer who opts in sends weekly usage counts that hold no text, and sees each report before it goes.

**Architecture:** The share code is one lazy chunk that loads only when the writer opens the Share panel or a reader opens `/r/:shareId`. The bundle is the export tree that share-safe export already builds (`buildExportDoc`, then `shareSafe`), so a memoir share carries aliases and a poem keeps its layout. `src/lib/crypto.ts` encrypts it with a new AES-GCM 256 key in the browser. The key stays in the link fragment (`#k=`) and on the writer's device. Every call to Supabase is a PostgREST RPC through `vloFetch` with the purpose `share` or `usage`, so each one is in the network log.

**Tech Stack:** Supabase free plan (Postgres functions with `security definer`, row level security with no policies), Web Crypto (AES-GCM, SHA-256), the browser's `CompressionStream`, Dexie, React Router, Playwright, PGlite for SQL tests.

**Spec:** `docs/VLO_SPEC.md` sections 1, 3 (F17, F27, F28, F30, US06, US12, US13), 5 (`ShareRecord`, `NetworkLogEntry`), 11, 12, 14 (Phase 5), 15, 16.

**Already done:** `NetPurpose` has `share` and `usage`, and `HOSTS` lists no host for them, so every such request fails now. `Referrer-Policy: no-referrer` is in `vercel.json`. `shareSafe` and `nameCheck` (Phase 2 and 3) build the aliased export tree. `keys.ts` (Phase 4) has PBKDF2 and AES-GCM code for the key store.

## Decisions for the product owner

| # | Topic | Recommendation | Other choice |
| --- | --- | --- | --- |
| S1 | Supabase project | You create a free Supabase project and give me its project URL and its anon key. The anon key is public by design: it ships in the app, and row level security with no policies keeps the tables closed. I add both as Vercel environment variables. You apply the migrations with the SQL editor or `npx supabase db push`, or you tell me to apply them. The service key never leaves your Supabase dashboard. | I create the project. That needs your Supabase account login, and the spec says to ask you for the project reference and keys. |
| S2 | Client code | Plain PostgREST RPC calls (`POST /rest/v1/rpc/<function>`) through `vloFetch`. Vlo calls 7 functions and reads no table, so it needs no package, and each call goes in the network log. | `@supabase/supabase-js` 2.118.0 (MIT, about 45 KB gzip) with `vloFetch` as its custom fetch, as spec section 6 says. It adds auth, realtime and storage code that Vlo never calls. |
| S3 | Bundle size | The bundle JSON is gzipped with the browser's `CompressionStream` before encryption. A 100,000-word novel then fits in the 2.8 MB limit of `create_share`. A share that is still too large says so, with its size. | No compression. A share over about 2 MB of JSON (about 300,000 words) fails. |
| S4 | Comments | A reader taps a paragraph, a stanza or a heading and writes a comment, with an optional name. The comment holds the place (section and block number) and the first 12 words of the block, so the writer sees what it is about after the text changes. The writer reads comments in the Share panel, by link and by item. | One comment box at the end of each item. Simpler, but a comment on a long chapter then has no place. |
| S5 | Expired and revoked links | The reader view says "This link expired on <date>." or "The writer stopped sharing this link." and shows no text. The Share panel lists the link as expired or revoked until the writer removes it from the list. | Remove a link from the list as soon as it expires. The writer then loses the comments. |
| S6 | Usage counts | Off by default. In Settings, "Send weekly usage counts" opens a dialog with the exact allowlist and an example. When it is on, the Library shows once a week "This week's usage report is ready", with the exact JSON and the buttons "Send" and "Skip this week". Nothing goes without a press of Send. | Send each week by itself after the first consent. The spec asks that the writer can view each report before it goes, and an automatic send makes that easy to miss. |
| S7 | Free plan care | A `keepalive.yml` workflow calls `ping()` every 3 days, as the spec says. A third migration schedules the cleanup with `pg_cron` (the Supabase free plan has it), so no service key goes in a GitHub secret. The GitHub Actions billing block also stops the keepalive, so the Supabase project pauses after 7 days until you fix the billing or press "Restore" in Supabase. | A Vercel cron job calls `ping()`. The app is static, so this adds a Vercel function only for the ping. |
| S8 | Architecture review | Spec section 16 asks for `improve-codebase-architecture` after Phase 4. I run it as Task E0 and fix only the findings in code that Phase 5 changes (export tree, privacy, network module). Other findings go to Phase 6. | Run the whole review in Phase 6 only. |

## Packages (for approval)

| Package | License | Ships to browser | Reason |
| --- | --- | --- | --- |
| @electric-sql/pglite 0.5.11 | Apache-2.0 | no, tests only | Runs the real migration SQL (with `pgcrypto`) in a unit test, because the build container has no Docker for `supabase start`. |

S2 needs no package. If you choose `@supabase/supabase-js`, it is a runtime package in the share chunk.

## Global Constraints

- Everything in the Phase 0 to 4 plans' Global Constraints still holds.
- "Only ciphertext leaves the device." Each `create_share` and `add_comment` body holds base64 ciphertext and IV only. The key and the owner token in plain form never go in a request body, a URL path, a query or a header.
- "Never store a share key or owner token anywhere except the writer's device." The `shares` Dexie table holds them. A backup file leaves them out.
- The link is `https://<app>/r/<shareId>#k=<base64url key>`. `Referrer-Policy: no-referrer` stays.
- Expiry choices are 1, 7, 14 and 30 days. Limits from the migration: bundle 2,800,000 characters, comment 20,000 characters, 500 comments a link.
- A memoir share passes through `shareSafe`: "Rosa" appears 0 times in the bundle built from the memoir fixture (US06).
- The reader view renders untrusted data on the app's origin. It builds every node with React from a checked bundle. No `dangerouslySetInnerHTML`, no HTML string, no link that is not `https:`.
- The reader view loads no editor and no AI code, and reads no project data. Its route chunk stays under 60 KB gzip. It works at 390 px (US13).
- Usage reports use only the keys `templates_used`, `words_added_band`, `poems_added_band`, `features_used`, `ai_mode_counts`, `error_codes`, and the bands `0`, `1-249`, `250-999`, `1000-4999`, `5000+`. A report is at most 4 KB.
- In Pen mode with no share link and usage counts off, the app still sends nothing (US09).
- The CSP `connect-src` and `HOSTS.share` and `HOSTS.usage` list the one Supabase host from `VITE_SUPABASE_URL`. A build with no Supabase variables shows "Sharing is not set up in this build." and sends nothing.
- axe finds zero serious issues on the Share panel, the reader view (each state), the comment form, the usage dialog and the weekly report prompt, in each theme.

## Review Focus

1. **A crafted bundle or comment.** Anyone with a link can call `create_share` or `add_comment` with any ciphertext and the same key. Expected: a bundle or comment that fails the schema check shows "This link holds text that Vlo cannot read.", and no script, style, form or non-https link reaches the page. Pinned in Task E4.
2. **A changed byte.** Expected: a changed byte in the payload, the IV or the key fails to decrypt with a plain message, never a partial text. Pinned in Task E2.
3. **The key in a request.** Expected: no request in a share session holds the key in any form (base64url, base64 or hex), checked over the captured request bodies, URLs and headers. Pinned in Task E3 (Gate 5).
4. **A comment on a revoked or expired link.** Expected: the server refuses it, and the reader view says why and keeps the typed comment in the box. Pinned in Task E4.
5. **A backup and an import.** Expected: a backup file holds no share key or owner token, and an import into a new device lists no share links. Pinned in Task E1.

---

## Part E: Sharing and usage counts (pull requests E1 to E4)

### Task E0: Architecture review after Phase 4 (pull request E1)

**Files:** Modify only files that the review names and that Phase 5 also changes.

- [x] Run `anthropic-skills:improve-codebase-architecture` on `src/features/export`, `src/lib/privacy.ts`, `src/lib/net.ts` and `src/features/ai`. Write the findings to `docs/architecture-review-phase-4.md`.
- [x] Fix the findings in the export tree, privacy and network code, each with its existing tests still passing. List the others for Phase 6 in STATUS.

### Task E1: Migrations, the RPC client and the local share records (pull request E1)

**Files:** Create `supabase/migrations/0001_shares.sql`, `0002_usage.sql`, `0003_cleanup.sql`, `src/features/share/rpc.ts`, `src/features/share/config.ts`, `tests/unit/migrations.test.ts`, `tests/unit/share-rpc.test.ts`. Modify `src/lib/db.ts`, `src/lib/net.ts`, `vercel.json`, `src/features/backup/backup.ts`, `.env.example`.

**Interfaces:**

- Produces: `supabaseConfig(): { url: string; anonKey: string } | null` from `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
- Produces: `rpc<T>(name: RpcName, args: Record<string, unknown>, purpose: 'share' | 'usage'): Promise<T>`. It throws `ShareError` with `kind: 'not-set-up' | 'offline' | 'unavailable' | 'too-large' | 'limit' | 'server'`. The `kind` comes from the Postgres message (`payload too large`, `share unavailable`, `comment limit reached`, `bad expiry`).
- Produces: Dexie version 5 with `shares: 'id, projectId, createdAt'`, rows of the spec's `ShareRecord` plus `title: string` and `comments: StoredComment[]`.

- [x] `0001_shares.sql` is the spec's migration word for word. `0002_usage.sql` adds `usage_reports` and `submit_usage` with the spec's allowlist, band check and 4 KB limit. `0003_cleanup.sql` adds `cleanup_shares()` (deletes shares 30 days after expiry) and a daily `pg_cron` job, and grants `cleanup_shares` to no role.
- [x] `migrations.test.ts` runs the 3 files in PGlite with `pgcrypto`, as the `anon` role: a table select fails; `create_share` with `p_days = 3` fails with "bad expiry"; a 2,800,001-character payload fails; `get_share` gives `status = 'expired'` and null payload after `expires_at` (set with an update as the owner); `revoke_share` with a wrong token gives false; the 501st comment fails; `submit_usage` with a key outside the allowlist, a band outside the list or 4,097 bytes fails; `cleanup_shares` deletes a share expired 31 days ago and keeps one expired 29 days ago.
- [x] `HOSTS.share` and `HOSTS.usage` hold the host of `VITE_SUPABASE_URL`, and `vercel.json` lists the same host in the CSP `connect-src`. The two values are public and go in the committed `.env` when the project exists. A unit test checks that the CSP lists exactly the hosts of `HOSTS`.
- [x] `rpc` sends `apikey` and `Authorization: Bearer <anon key>` headers. The network log keeps the host, the path and the bytes only, as for AI requests.
- [x] Dexie version 5 with an upgrade test from version 4. `backup.ts` leaves out the `shares` table, with a test that a backup of a project with a share holds no key and no token (Review Focus 5).

### Task E2: Crypto module (pull request E1)

**Files:** Create `src/lib/crypto.ts`, `tests/unit/crypto.test.ts`. Modify `src/features/ai/keys.ts` to use its base64 helpers.

**Interfaces:**

- Produces: `newShareKey(): Promise<{ key: CryptoKey; text: string }>` (`text` is base64url of 32 raw bytes), `importShareKey(text: string): Promise<CryptoKey>`, `newOwnerToken(): string` (base64url of 32 random bytes).
- Produces: `sealJson(value: unknown, key: CryptoKey): Promise<{ payload: string; iv: string }>` (JSON, gzip, AES-GCM with a new 12-byte IV, base64) and `openJson(sealed: { payload: string; iv: string }, key: CryptoKey): Promise<unknown>`. `openJson` throws `CryptoError('damaged')` on any failure.

- [x] Tests first: a round trip of the memoir fixture bundle; a new IV for each seal; a changed byte in the payload, in the IV or in the key fails with `CryptoError('damaged')` (Review Focus 2); a key text that is not 32 bytes fails; `newOwnerToken` gives 43 characters and two calls differ; the Phase 4 key store tests still pass after `keys.ts` uses the shared helpers.

### Task E3: Share panel (F27, US06, US12) (pull request E2)

**Files:** Create `src/features/share/bundle.ts`, `share.ts`, `SharePanel.tsx`, `tests/unit/share-bundle.test.ts`, `tests/e2e/share.spec.ts`. Modify the project header (a Share button), `src/features/project/ProjectPage.tsx` and the command menu.

**Interfaces:**

- Consumes: `buildExportDoc`, `shareSafe` (Phase 2 and 3), `sealJson`, `newShareKey`, `newOwnerToken` (E2), `rpc` (E1).
- Produces: `ShareBundle { v: 1; title: string; author?: string; font: string; createdAt: number; sections: ExportSection[] }`, and `parseBundle(value: unknown): ShareBundle | null`, which checks every field and every block type of `ExportSection` and gives null for anything else.
- Produces: `createShare(input: { project: Project; items: Item[]; itemIds: string[]; days: 1 | 7 | 14 | 30; people: PrivatePerson[] }): Promise<ShareRecord>`, `revokeShare(id: string): Promise<void>`, `shareLink(record: ShareRecord): string`.

- [x] The panel: pick items (the open item first), pick the expiry, "Create link". Then "Copy link", the expiry date, and the line "Your copy on this device is the main copy. Readers see this version until you share again." The list shows each link with its items, its expiry and its state (active, expired, revoked), "Copy link", "Stop sharing" (a confirm), and "Remove from list" for an expired or revoked link (S5).
- [x] A memoir share runs `nameCheck` first and shows the same check as share-safe export before it creates the link.
- [x] Tests: the bundle of the memoir fixture holds "Rosa" 0 times (US06); `parseBundle` refuses an unknown block type, a missing field and a string where an array goes; a fake Supabase (Playwright routes on the real RPC paths) receives only `p_payload`, `p_iv`, `p_owner_token` and `p_days`, and no captured body, URL or header holds the key in base64url, base64 or hex (Review Focus 3, Gate 5); Stop sharing sends the owner token only in the `revoke_share` body; "Sharing is not set up in this build." with no variables; axe.

### Task E4: Reader view with comments (F28, US12, US13) (pull request E3)

**Files:** Create `src/features/reader/ReaderPage.tsx`, `ReaderText.tsx`, `CommentForm.tsx`, `comments.ts`, `tests/e2e/reader.spec.ts`. Modify `src/app/routes.tsx` (a lazy `/r/:shareId` route outside the app shell and outside the welcome redirect) and `src/features/share/SharePanel.tsx` (comments).

**Interfaces:**

- Consumes: `parseBundle`, `importShareKey`, `openJson`, `sealJson`, `rpc`.
- Produces: `ReaderComment { v: 1; section: number; block: number; quote: string; name?: string; text: string; at: number }` and `parseComment(value: unknown): ReaderComment | null`.

- [x] The route reads `#k=` once, then removes the fragment from the address bar with `history.replaceState`, so a screenshot or a copied URL does not show the key.
- [x] `ReaderText` renders each block type with React elements only. Math renders from the existing MathML converter through `DOMParser`, and only MathML element names and the attributes `display`, `mathvariant` and `stretchy` go into the page. A non-`https:` link renders as plain text (Review Focus 1).
- [x] States: loading; "This link expired on <date>." (US12, with the server's `expired` status); "The writer stopped sharing this link."; "This link is missing its key. Ask the writer for the whole link."; "This link holds text that Vlo cannot read." for a damaged or unchecked bundle.
- [x] Comments (S4): a tap on a block opens the comment form below it, with an optional name and "Send comment". Sent comments show under their block. A refusal from the server shows its reason and keeps the typed text (Review Focus 4).
- [x] The Share panel lists the comments of each link by item and block quote, with "Refresh comments". Each comment passes `parseComment` first.
- [x] Tests: US12 with a 14-day link opened on day 15 (the fake server returns `expired`); US13 at 390 px (read, comment, no account, the writer sees the comment); a crafted bundle with a `<script>` string, an `onerror` attribute string and a `javascript:` link renders as text, and the page holds no `script` element that the app did not ship; a crafted comment the same; the fragment is gone from `location.href` after load; the route loads no editor chunk and no AI chunk, and reads no project row; axe in each state and theme.

### Task E5: Opt-in usage counts (F30) (pull request E4)

**Files:** Create `src/features/usage/usage.ts`, `UsageDialog.tsx`, `WeeklyReport.tsx`, `tests/unit/usage.test.ts`, `tests/e2e/usage.spec.ts`. Modify `src/features/settings/SettingsPage.tsx`, the Library page, and the places that record a feature use or an error code.

**Interfaces:**

- Produces: `recordFeature(name: FeatureName): void` and `recordError(code: ErrorCode): void`, which add to this week's local counts in `appMeta` (they do nothing while usage counts are off), and `weeklyReport(now: number): UsageReport | null`.
- Produces: `FeatureName` (a fixed list, such as `export-docx`, `snapshot-restore`, `focus-mode`, `share-create`, `board`, `timeline`) and `ErrorCode` (a fixed list, such as `export-failed`, `storage-full`, `backup-import-failed`, `share-failed`). Names come from these lists only, never from the writer's text.

- [ ] `weeklyReport` builds `{ templates_used, words_added_band, poems_added_band, features_used, ai_mode_counts, error_codes }` from `sessions`, the projects and the local counts of the last full ISO week. Bands as the spec says.
- [ ] S6: the Settings switch, the consent dialog, the weekly prompt in the Library with the exact JSON, "Send" and "Skip this week". A send calls `submit_usage` with purpose `usage`. A switch-off clears the local counts.
- [ ] Tests: each band edge (0, 1, 249, 250, 999, 1000, 4999, 5000); a report of the fixture library holds no title, name or word of text (a scan for each title and each word over 3 letters); a report stays under 4 KB with every feature and error code; with the switch off, no request and no prompt; the sent body is the shown JSON; axe.

### Task E6: Free plan workflows and docs (pull request E4)

**Files:** Create `.github/workflows/keepalive.yml`, `docs/adr/0004-encrypted-shares.md`, `docs/sharing-setup.md`. Modify `docs/STATUS.md`.

- [ ] `keepalive.yml`: every 3 days and on `workflow_dispatch`, `curl` the `ping` RPC with the anon key from the repository secret `SUPABASE_ANON_KEY` and the URL from the variable `SUPABASE_URL`. It fails when the answer is not `1`.
- [ ] `docs/sharing-setup.md`: the steps for S1, the Vercel variables, the migration commands, and how to restore a paused project.
- [ ] ADR 0004: client-side encryption, the key in the fragment, the bundle as the export tree, and RPC through `vloFetch` (S2).

**Gate 5:** US12 and US13 pass. A test proves that the Supabase request body contains only ciphertext and never the key. A fresh review agent that has not seen the implementation runs `superpowers:requesting-code-review` as a security review of the share flow and the reader view, and every high finding is fixed. axe passes on every new screen. The open and keystroke budgets still pass, and the initial JavaScript stays under 250 KB gzip.
