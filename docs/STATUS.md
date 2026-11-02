# Vlo status

Last update: 2026-11-02

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

## In progress

- Phase 1 pull request 1 (tasks 1 to 9).
- Phase 1 tasks 10 to 14 follow in pull request 2.
- Firefox in CI: about one `page.goto` in 50 waits 30 s for the load event, then passes on retry. Main showed the
  same thing in Phase 0. Task 13 looks for the cause.

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

| Date       | Change                                                                                 | Reason                                                                                                                 |
| ---------- | -------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| 2026-11-02 | `vercel.json` replaces `public/_headers`.                                              | Hosting moved to Vercel.                                                                                               |
| 2026-11-02 | The CSP has no Supabase host until Phase 5.                                            | The spec value is a placeholder.                                                                                       |
| 2026-11-02 | Routes arrive in the phase that builds their screen.                                   | No placeholder screens (section 0, rule 8).                                                                            |
| 2026-11-02 | Paper adds `--accent-text: #B83E28`.                                                   | `#C8452D` on `#F5F1E8` is 4.29:1 and fails WCAG AA for body text.                                                      |
| 2026-11-02 | Sepia adds surface `#F6ECD9`, muted `#6E5D48`, rule `#DCCBAA`.                         | The spec gives only three Sepia colors.                                                                                |
| 2026-11-02 | TypeScript 6.0, not 7.0.                                                               | typescript-eslint 8.72 supports TypeScript below 6.1.                                                                  |
| 2026-11-02 | ESLint 9.39, not 10.                                                                   | eslint-plugin-jsx-a11y 6.10 supports ESLint up to 9.                                                                   |
| 2026-11-02 | The CSP adds `manifest-src 'self'`.                                                    | Tighter than the `default-src` fallback, same effect.                                                                  |
| 2026-11-02 | `/assets/*` gets `Cache-Control: public, max-age=31536000, immutable`.                 | File names carry a content hash.                                                                                       |
| 2026-11-02 | The SPA rewrite skips `/assets/`, `/icons/`, `/sw.js`, `/workbox-*` and the manifest.  | A missing file must return 404, never `index.html`, or the service worker can cache HTML as a script.                  |
| 2026-11-02 | In WebKit the offline test checks only the precache.                                   | Playwright cannot load a service-worker page in WebKit with the network off. Real Safari is a manual check in Phase 6. |
| 2026-11-02 | `@tiptap/y-tiptap` and `y-protocols` replace `y-prosemirror`.                          | `@tiptap/extension-collaboration` 3.32 needs them as peers.                                                            |
| 2026-11-02 | Shared-element transitions use React's `<ViewTransition name>`, not Motion `layoutId`. | React Router 8 deprecates its `viewTransition` option and points to React 19.3 `<ViewTransition>` (rule 11).           |
| 2026-11-02 | Two tabs on one item sync live through `BroadcastChannel`.                             | Better than the planned notice alone. Yjs merges both tabs, so no typing is lost.                                      |
