# Phase 6: Hardening and Launch Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Vlo meets every accessibility rule and every performance budget in spec section 12, explains what leaves the device on `/privacy`, helps writers on `/help`, has a contributor README, and goes to production after the product owner approves Gate 6.

**Architecture:** No new feature code. Two new test files measure the whole app: `a11y.spec.ts` runs axe on every route in each theme, and `performance.spec.ts` gets the three budgets that it does not test yet. The two new pages follow the AI policy pattern: the words live in one TypeScript module, a Markdown copy lives in `docs/`, and a unit test keeps them the same. The architecture review runs first, so its fixes land before the measurements.

**Tech Stack:** Playwright with `@axe-core/playwright` and the Chrome DevTools Protocol (CPU and network throttling), the browser `PerformanceObserver` (`largest-contentful-paint`, `event`), Vitest, React Router.

**Spec:** `docs/VLO_SPEC.md` sections 3, 4 (routes), 12, 14 (Phase 6), 15, 16, 18. `docs/architecture-review-phase-4.md` findings 5 to 7. `docs/STATUS.md` "In progress" (the real Safari checks and the craft first-key time).

**Already done:** axe runs in 33 browser test files, through `seriousIssues(page)` in `tests/e2e/support/axe.ts`. `performance.spec.ts` holds the open and keystroke budgets on the 100,000-word project. `bundle-size.test.ts` holds the 250 KB initial budget. The footer of `AppShell.tsx` links the network log and the AI policy.

## Decisions for the product owner

| # | Topic | Recommendation | Other choice |
| --- | --- | --- | --- |
| T1 | CI for Gate 6 | Gate 6 needs every user story to pass in CI on all 4 browsers, and the free Actions minutes ran out. Make the repository public. GitHub gives public repositories free minutes on standard runners, the code is MIT, and spec question 2 wanted open code so that writers can check the privacy promises. | Wait for the minutes to reset at the start of the next billing month, or buy minutes. |
| T2 | Production | Vercel deploys `main` to production. You merge the Phase 6 pull request after you approve Gate 6. I then run a smoke test on the production address. I need that address (the `*.vercel.app` name or your own domain). | You set a separate production branch in Vercel, and I open a pull request to it. |
| T3 | Sharing at launch | You create the Supabase project before Gate 6 (`docs/sharing-setup.md`, about 15 minutes), because F27, F28 and F30 are Must features. I then add the URL and the anon key, and check a share on a real phone with you. | Launch with sharing and usage counts off ("Sharing is not set up in this build."), and turn them on in a later release. |
| T4 | Support links on `/help` | Find A Helpline (findahelpline.com, a free directory of crisis lines in many countries), 988 Suicide and Crisis Lifeline (call or text 988, USA), Samaritans (116 123, UK and Ireland), and a short note on how to pace work on painful material. | Only the Find A Helpline directory, so that no number goes out of date. |
| T5 | User guide | The guide is the `/help` page in the app, so it works offline. The README links to it. One copy of the words, kept in `src/features/help/help.ts`. | A separate `docs/user-guide.md` and a short `/help` page with the support links only. |
| T6 | Contact on `/privacy` | The GitHub issues page of the repository (works if T1 makes it public). | An email address that you give me. |

Answered on 2026-11-08: T1, T2, T4, T5 and T6 as recommended. T3: launch with sharing and usage counts off. The Help page leaves out the sharing steps in a build with no Supabase project.

## Packages

None.

## Global Constraints

- Everything in the Phase 0 to 5 plans' Global Constraints still holds.
- "WCAG 2.2 AA in all themes." axe finds zero serious or critical issues on every route, in Ink, Paper and Sepia.
- Budgets (spec section 12): initial JavaScript under 250 KB gzip; Library LCP under 2.5 s on a mid-range phone; INP under 200 ms on all screens; keystroke to screen under 50 ms at the 95th percentile on the 100,000-word project; open a 10,000-word item under 300 ms; DOCX export of a 100,000-word novel under 10 s without blocking the main thread.
- "Mid-range phone" means the Lighthouse mobile profile: 4x CPU slowdown, 150 ms round trip, 1.6 Mbit/s down, 750 kbit/s up, at 412 x 823 px. Chromium only, because only Chromium has the CDP throttling.
- "Without blocking the main thread" means no long task over 200 ms on the main thread during the export.
- `/privacy` lists each network purpose in `HOSTS` (`src/lib/net.ts`), with its hosts and what it sends. A unit test fails when a purpose has no entry.
- `/privacy` and `/help` load in Pen mode with no network request, and each page has a version and a date.
- Support links open in a new tab with `rel="noreferrer"`. Vlo sends nothing when the writer opens `/help`.
- Any number or name on `/help` comes from the organization's own site on the day of writing. The date goes on the page.
- No change to the CSP: navigation to a link is not a `connect-src` request.

## Review Focus

1. **A dialog or a menu in a theme that axe never saw.** Expected: each dialog that a route opens from its main controls passes axe in all 3 themes. Pinned in Task F2 (the dialog list).
2. **A slow first keystroke.** The craft test's first key takes 39 to 125 ms in the build container. Expected: the first key after an item opens meets the 50 ms budget, with the cause found before any change. Pinned in Task F3.
3. **A privacy page that goes out of date.** Expected: a new network purpose or host fails a unit test until `/privacy` lists it. Pinned in Task F4.
4. **A privacy fix that changes the order of the privacy steps.** Expected: the memoir AI request body and every export still hold "Rosa" 0 times after the Task F1 refactor. Pinned in Task F1 (the existing leak tests run before and after).
5. **A production build with the wrong settings.** Expected: the production address sends the same headers as `vercel.json`, the app opens offline after one visit, and Pen mode sends nothing. Pinned in Task F6.

---

## Part F: Hardening and launch (one pull request)

### Task F1: Architecture review and the top fixes

**Files:** Create `docs/architecture-review-phase-6.md`, `src/features/ai/request.ts`, `tests/unit/ai-request.test.ts`. Modify `src/lib/privacy.ts`, `src/features/ai/AssistantPanel.tsx`, `src/features/export/ExportDialog.tsx`. Remove `src/features/ai/names.ts` and `src/features/ai/projectNames.ts` if their work moves into `privacy.ts`.

**Interfaces:**

- Produces: `privatePeople(projectId: string): Promise<PrivatePerson[]>` in `src/features/people/people.ts` (finding 5), used by the export dialog, the Share panel, the AI path and the web originality check. It stays out of `src/lib/privacy.ts`, which holds only pure text code.
- Produces: `buildAiRequest(input: RequestInput): Promise<{ ok: true; request: AiRequest; aliased: boolean; people: PrivatePerson[]; target?: Target } | { ok: false; message: string }>` in `src/features/ai/request.ts` (finding 7). It does the order: text, passages, people, aliases, size check. The panel restores names in an answer with `restoreNames(answer, people, aliasOn)`. The key check stays in the panel.

- [ ] Run `anthropic-skills:improve-codebase-architecture` on all of `src/`. Write the findings to `docs/architecture-review-phase-6.md`, ranked by risk to a writer, with findings 5 to 7 of the Phase 4 review in the list.
- [ ] Run `npx vitest run tests/unit/private-names-leak.test.ts tests/unit/privacy.test.ts` and the assistant browser tests. Expected: PASS before any change.
- [ ] Tests first for `buildAiRequest`: the memoir fixture request holds "Rosa" 0 times and "Maria" at least once; a marked name in the open item is aliased even with no person row; `restore` turns "Maria" back to "Rosa" in an answer; a request over the size limit gives `ok: false` with the panel's current message.
- [ ] Move the code. `AssistantPanel.tsx` calls `buildAiRequest` and keeps only its React state.
- [ ] Fix finding 6 (export worker order) only if the review ranks it in the top 3. Else list it in STATUS.
- [ ] Each other finding that the review ranks high gets a line in the review file and in STATUS. I fix none of them without a new plan line that you approve.
- [ ] Run the full unit suite and the leak, export, share and assistant browser tests. Expected: PASS. Commit.

### Task F2: Accessibility pass on every route

**Files:** Create `tests/e2e/a11y.spec.ts`. Modify only the components that it finds at fault.

**Interfaces:**

- Consumes: `seriousIssues(page)`, the seed helpers in `tests/e2e/support/`, and the novel, memoir and poetry fixtures.

- [ ] Write `a11y.spec.ts`: for each theme (Ink, Paper, Sepia) and each route in spec section 4 plus `/help` and the 404 page, open the route with seeded data and expect `seriousIssues(page)` to equal `[]`. Project routes use the template that owns them (board: novel, timeline and people: memoir, sequences: poetry). `/r/:shareId` uses a routed fake share, as `reader.spec.ts` does.
- [ ] Add the dialogs that each route opens from its main controls (export, snapshots, Share, mode, key, usage consent, import) to the same loop.
- [ ] Add keyboard paths (spec section 12): Tab reaches each control in the binder, board List view, timeline, sequencer and each dialog, the focus ring is visible (outline width over 0), and Escape closes each dialog and puts focus back on its opener.
- [ ] Run `npx playwright test a11y.spec.ts --project=chromium`. Fix each issue in the component at fault, with the smallest change. Expected: PASS.
- [ ] Run `anthropic-skills:impeccable` rules by hand on the 2 new pages (spec section 16, audit at the end of Phase 6). Commit.

### Task F3: Performance pass against every budget

**Files:** Modify `tests/e2e/performance.spec.ts`, `tests/unit/export-run.test.ts` or a new `tests/unit/export-large.test.ts`. Modify app code only where a budget fails.

- [ ] `LCP: the Library paints its largest element in under 2.5 s on a mid-range phone`: Chromium only, CDP `Emulation.setCPUThrottlingRate` 4 and `Network.emulateNetworkConditions` with the global constraint values, a cold load of `/` with 3 seeded projects, read the last `largest-contentful-paint` entry before the first input. Expected: under 2,500 ms.
- [ ] `INP: each screen answers its main action in under 200 ms`: on the Library, project, board, timeline, people, sequences, submissions, progress, settings and network routes, click the main control 10 times, read `event` entries with `durationThreshold: 16` and take the largest `duration` per interaction. Expected: under 200 ms at the 98th percentile, the way INP counts it.
- [ ] `DOCX: the 100,000-word novel exports in under 10 s and never blocks the main thread`: start the export from the dialog on the seeded large project, observe `longtask` entries during the export. Expected: the file arrives in under 10 s, and no long task is over 200 ms.
- [ ] The craft first key: use `superpowers:systematic-debugging`. Record a trace of the first key in `craft.spec.ts` Review Focus 6, find the work in that frame, and fix the cause. Expected: 10 runs in a row under 50 ms in the build container, or a STATUS entry that names the cause and why it is only in the container.
- [ ] Run the whole `performance.spec.ts` 3 times on Chromium and once on the phone profile. Write the results to STATUS. Commit.

### Task F4: `/privacy` and `/help`

**Files:** Create `src/features/policy/privacy.ts`, `src/features/policy/PrivacyPage.tsx`, `docs/privacy.md`, `src/features/help/help.ts`, `src/features/help/HelpPage.tsx`, `tests/unit/privacy-page.test.ts`, `tests/e2e/help.spec.ts`. Modify `src/app/routes.tsx` (2 lazy routes), `src/app/AppShell.tsx` (2 footer links), `tests/unit/routes.test.tsx`.

**Interfaces:**

- Produces: `PRIVACY: { version: number; date: string; stays: string[]; leaves: Record<NetPurpose, { when: string; sends: string; hosts: string }>; contact: string }`.
- Produces: `HELP: { version: number; date: string; guide: { title: string; steps: string[] }[]; support: { name: string; detail: string; url: string }[]; checkedOn: string }`.

- [ ] Tests first: each key of `HOSTS` has a `PRIVACY.leaves` entry, and each host of `HOSTS[purpose]` appears in its `hosts` text; `docs/privacy.md` holds each `PRIVACY` sentence word for word (as `ai-policy.test.ts` does); each `HELP.support` URL is `https:`.
- [ ] `PRIVACY.stays` covers the text, titles, notes, people, snapshots, keys (memory by default), share keys and owner tokens, and the network log. `PRIVACY.leaves` covers `ai`, `model-download`, `share`, `usage` and `originality`, each with the press that starts it.
- [ ] `HELP.guide` covers: start a project, write and find text, snapshots, backup and import, export, the template views, private names, AI modes, sharing, install and offline use, and Safari storage. Each section has at most 6 steps.
- [ ] `help.spec.ts`: both pages open in Pen mode with 0 network log entries and 0 requests to other origins; each support link has `target="_blank"` and `rel="noreferrer"`; the footer links reach both pages. Commit.

### Task F5: README, Safari storage plan

**Files:** Create `README.md`, `docs/safari-storage-test.md`. Modify `docs/STATUS.md`.

- [ ] `README.md` for contributors: what Vlo is (2 sentences), the link to `/help`, Node 22 setup, the npm scripts in `package.json`, the test layout, the rules (only `src/lib/net.ts` makes requests, no third-party scripts, Pen mode sends nothing), where the spec, plans, ADRs and STATUS live, and the license.
- [ ] `docs/safari-storage-test.md`: two runs over 14 days on a real iPhone or Mac, one with Vlo added to the Home Screen and one in a Safari tab only. Steps for day 0 (create the 3 fixture projects, note `navigator.storage.persisted()` and the storage estimate), checks on days 1, 3, 7 and 14 (text present, snapshot count, backup reminder), and a result table to fill in. It also holds the real Safari budget checks from STATUS (open under 300 ms, plain typing, typing with a moving scene, typing with 500 shimmering runs) and the offline open.
- [ ] Commit.

### Task F6: Gate 6 and the release

- [ ] Update STATUS, ADRs and `docs/licenses.md`. Run `npm run typecheck`, `lint`, `format:check`, `test`, `build`, `size` and the Chromium and phone browser suites in the build container. Expected: PASS.
- [ ] A fresh review agent that has not seen the implementation reviews the whole Phase 6 diff and the release checklist (spec section 16). Fix each high finding.
- [ ] Open the pull request. Ask you to run "Run workflow" for all 4 browsers (T1). Expected: every user story passes.
- [ ] After you approve Gate 6 and merge: open the production address, check the headers against `vercel.json`, check an offline reload, and check that a 60 s Pen mode session sends nothing. Write the result to STATUS.
