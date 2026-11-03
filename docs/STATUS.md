# Vlo status

Last update: 2026-11-03

## Done

- Spec saved as `docs/VLO_SPEC.md`.
- Section 17 questions answered.
- Phase 0 plan approved (`docs/plans/phase-0.md`).
- Phase 0 tasks 1 to 7 built on branch `phase-0-foundation` (pull request #2):
  - Vite, React, TypeScript (strict), Tailwind, shadcn/ui pieces, React Router.
  - ESLint network rule (only `src/lib/net.ts` may make network requests).
  - Ink, Paper and Sepia themes, self-hosted fonts, Calm mode and reduced motion (F08).
  - App shell, Library empty state, Settings, 404, route and root error screens.
  - PWA: offline app shell, manifest, update prompt that never reloads a tab by itself (F09).
    Chromium reports no installability errors (CDP check in `tests/e2e/pwa.spec.ts`).
  - `vercel.json` with the CSP and security headers. `vite preview` sends the same headers.
  - Bundle-size check: 121 KB gzip of a 250 KB budget.
  - CI on GitHub Actions, with Playwright on Chromium, Firefox, WebKit and mobile Chrome.

- Phase 0 merged (pull request #2). The product owner imported the repository in Vercel for preview links.
- Phase 1 plan approved (`docs/plans/phase-1.md`), as two pull requests.
- Phase 1 tasks 1 to 9 built on branch `phase-1-core-writing`:
  - Dexie schema with `itemTexts` and `appMeta` (ADR 0003), fractional ordering, word counts with `Intl.Segmenter`.
  - Yjs item documents in `vlo-item-<itemId>` databases. Only the open item loads.
  - Templates for Novel, Memoir and Poetry collection (F03). Library cards with create, rename and delete.
  - Onboarding in three steps with Pen mode preselected and Skip on every step (F13, US15).
  - Binder with mouse, touch, keyboard and menu reorder (F02).
  - Prose and poem editors. Poems keep every space, stanza and hanging indent (F01).
  - Autosave within 1 s, save status, word count, and live sync between tabs (F04, US02).
- Snapshots after every 10 active minutes and on demand, a word diff between any two versions, and restore
  in 2 clicks that saves the current text first (F05, US03). The history panel and `diff` load on first open.
- Focus mode (hides the binder, details and site header; Escape leaves), typewriter scrolling, focus-line
  dimming, a session timer with a gentle close prompt, and a Mod-K command menu that finds items by title or
  text and runs actions (F10, F11). The menu, cmdk and MiniSearch load on first open.
- Library grid and list layouts, a staggered card entrance, card morphs between layouts and into the project,
  and a theme change that spreads from the chosen control. Calm mode and reduced motion stop every animation and
  start no view transition (F14, US14).
- Phase 0 follow-ups: each page sets its tab title and moves focus to its heading after navigation. The update
  notice uses a live region that is always present. Theme radios carry only the theme name. The unchecked switch
  track meets 3:1 contrast. The browser bar takes the theme's page color. Preferences save only after the
  writer's own change, and a cleared storage resets them. The app checks for an update each hour while online.
  An open editor takes a new name at once after a rename. `engines.node` is `22.x`, and Tailwind is a
  development package.
- Gate 1 tests: fixtures for the novel and memoir (spec section 15), a seeded 100,000-word project (40 chapters,
  120 scenes, 30 poems, one 10,000-word scene), a poem round trip that compares every character and hanging
  indent after reload, and the performance budgets. Each time runs to the first painted frame. Local Chromium
  results on the 100,000-word project:
  - Open the 10,000-word scene from the binder: 55 to 96 ms (budget 300 ms). On the phone layout, about 140 ms.
  - Keystroke to the next painted frame, 95th percentile of 200 keys typed 30 ms apart: about 19 ms (budget
    50 ms).
  - Only the open item's `vlo-item-*` database opens.
  - In CI, Firefox opens the scene in 61 ms with a keystroke time of 7 ms. Linux WebKit takes 364 to 567 ms. Its
    log shows the editor library filling the empty editor with all 10,000 words in one step (about 135 ms) and
    then painting (about 45 ms).
  - A cold page load straight to the scene, app start included: 450 to 500 ms on the desktop layout and about
    370 ms on the phone layout, where the binder is closed. The test logs it and does not hold it to the budget.
  - Manuscript blocks use `content-visibility: auto`, which took about 60 ms off the open.
- Binder speed fix: the drag sensors and the sortable list now keep the same objects between renders. Before,
  opening an item re-rendered all 191 binder rows, and WebKit in CI took 383 to 433 ms to open the long scene.
  Now only the 2 changed rows render.
- Design audit (Task 14, impeccable rules applied by hand, because the skill's scripts are not in the
  workspace). Fixed: on phones the project tools took over half of the first screen, so they show icons only
  under 640 px and keep their names for screen readers. Fixed: template labels were in tracked capitals, and now
  use sentence case. Left as they are: the 2 px quote rule on block quotes, white text on the accent color
  (the contrast tests pass), and the prose toolbar that wraps to two rows on phones.
- Review fixes for pull request 2:
  - The History diff runs in a Web Worker with a 10 s limit. A very large change shows "Too many changes to
    mark. Restore still works." and the page stays responsive.
  - Automatic snapshots count active minutes per item across editors, compare against the newest snapshot, keep
    the minutes after a failed save, and tell the writer when a save fails.
  - The session timer ends the session with its real totals when the writer leaves the project or the tab.
  - Turning reduced motion on keeps the open editor, its text and its focus.
  - The timer button reads "Session timer, 10:00 left". Snapshot names show seconds.
  - Typewriter scrolling centers on the visible area above an on-screen keyboard, and centers at once when the
    writer turns it on.
  - The command menu leaves out chapters and parts, shows a snippet for prefix and near-miss hits, and does not
    open over another dialog.
  - The hourly update check stops when the app unmounts. The theme reveal grows from the chosen radio in Safari
    too.
- Initial JavaScript: 187,284 bytes gzip (budget 250,000). Project route chunk: 196,417 bytes gzip. Command
  menu: 11,087 bytes. History panel: 5,201 bytes. Diff worker: 3,205 bytes.

## In progress

- Phase 1 pull request 1 (tasks 1 to 9) is merged as pull request #3.
- Phase 1 tasks 10 to 14 are in pull request #4.
- Real Safari: check the 300 ms open budget by hand in Phase 6. CI WebKit runs on Linux and has a 700 ms ceiling.
- Firefox in CI: about one `page.goto` in 50 waits 30 s for the load event, then passes on retry. Main showed the
  same thing in Phase 0. Firefox does not run in the build container, so the cause is still open. The CI
  retry covers it.

## Blocked

- Nothing.

## Decisions

| Date       | Decision                                                                 |
| ---------- | ------------------------------------------------------------------------ |
| 2026-11-02 | Repository: `Sophie-S-Z/vlo`.                                            |
| 2026-11-02 | License: MIT.                                                            |
| 2026-11-02 | Hosting: Vercel, built from GitHub (ADR 0002).                           |
| 2026-11-02 | Supabase project: create in Phase 5.                                     |
| 2026-11-02 | Phones: full editing. Board and timeline show as lists under 600 px.     |
| 2026-11-02 | AI presets: OpenRouter, Anthropic, Groq, Gemini, Ollama, LM Studio.      |
| 2026-11-02 | Manuscript font: Newsreader 12 pt, with a Courier-style option.          |
| 2026-11-02 | Marketing site: https://vlo-landing-page.vercel.app/                     |
| 2026-11-02 | Phase 1 motion uses CSS and View Transitions, no GSAP (plan decision 1). |
| 2026-11-02 | Plain-text copies of items live in `itemTexts` (ADR 0003).               |

## Spec changes

| Date       | Change                                                                                          | Reason                                                                                                                 |
| ---------- | ----------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| 2026-11-02 | `vercel.json` replaces `public/_headers`.                                                       | Hosting moved to Vercel.                                                                                               |
| 2026-11-02 | The CSP has no Supabase host until Phase 5.                                                     | The spec value is a placeholder.                                                                                       |
| 2026-11-02 | Routes arrive in the phase that builds their screen.                                            | No placeholder screens (section 0, rule 8).                                                                            |
| 2026-11-02 | Paper adds `--accent-text: #B83E28`.                                                            | `#C8452D` on `#F5F1E8` is 4.29:1 and fails WCAG AA for body text.                                                      |
| 2026-11-02 | Sepia adds surface `#F6ECD9`, muted `#6E5D48`, rule `#DCCBAA`.                                  | The spec gives only three Sepia colors.                                                                                |
| 2026-11-02 | TypeScript 6.0, not 7.0.                                                                        | typescript-eslint 8.72 supports TypeScript below 6.1.                                                                  |
| 2026-11-02 | ESLint 9.39, not 10.                                                                            | eslint-plugin-jsx-a11y 6.10 supports ESLint up to 9.                                                                   |
| 2026-11-02 | The CSP adds `manifest-src 'self'`.                                                             | Tighter than the `default-src` fallback, same effect.                                                                  |
| 2026-11-02 | `/assets/*` gets `Cache-Control: public, max-age=31536000, immutable`.                          | File names carry a content hash.                                                                                       |
| 2026-11-02 | The SPA rewrite skips `/assets/`, `/icons/`, `/sw.js`, `/workbox-*` and the manifest.           | A missing file must return 404, never `index.html`, or the service worker can cache HTML as a script.                  |
| 2026-11-02 | In WebKit the offline test checks only the precache.                                            | Playwright cannot load a service-worker page in WebKit with the network off. Real Safari is a manual check in Phase 6. |
| 2026-11-02 | `@tiptap/y-tiptap` and `y-protocols` replace `y-prosemirror`.                                   | `@tiptap/extension-collaboration` 3.32 needs them as peers.                                                            |
| 2026-11-02 | Shared-element transitions use React's `<ViewTransition name>`, not Motion `layoutId`.          | React Router 8 deprecates its `viewTransition` option and points to React 19.3 `<ViewTransition>` (rule 11).           |
| 2026-11-02 | Two tabs on one item sync live through `BroadcastChannel`.                                      | Better than the planned notice alone. Yjs merges both tabs, so no typing is lost.                                      |
| 2026-11-03 | Focus-line dimming uses 70 % opacity, not 40 %.                                                 | 40 % gave 2.2:1 to 3.3:1 contrast. 70 % meets WCAG AA in every theme (product owner decision).                         |
| 2026-11-03 | CI WebKit holds the open budget to a 700 ms ceiling. Real Safari is checked by hand in Phase 6. | Linux WebKit in CI takes 364 to 567 ms and varies by up to 200 ms per run (product owner decision).                    |
| 2026-11-02 | Storage health says "Unknown" and "Limit for Vlo", not "Not available" and "Quota".             | "Limit for Vlo" says what the number means. "Unknown" matches the other rows.                                          |
