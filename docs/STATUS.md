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

## In progress

- Phase 0 Gate 0: CI on all browsers, then a Vercel preview.

## Blocked

- Vercel preview: the product owner imports the repository at https://vercel.com/new.

## Decisions

| Date       | Decision                                                             |
| ---------- | -------------------------------------------------------------------- |
| 2026-11-02 | Repository: `Sophie-S-Z/vlo`.                                        |
| 2026-11-02 | License: MIT.                                                        |
| 2026-11-02 | Hosting: Vercel, built from GitHub (ADR 0002).                       |
| 2026-11-02 | Supabase project: create in Phase 5.                                 |
| 2026-11-02 | Phones: full editing. Board and timeline show as lists under 600 px. |
| 2026-11-02 | AI presets: OpenRouter, Anthropic, Groq, Gemini, Ollama, LM Studio.  |
| 2026-11-02 | Manuscript font: Newsreader 12 pt, with a Courier-style option.      |
| 2026-11-02 | Marketing site: https://vlo-landing-page.vercel.app/                 |

## Spec changes

| Date       | Change                                                                                | Reason                                                                                                |
| ---------- | ------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| 2026-11-02 | `vercel.json` replaces `public/_headers`.                                             | Hosting moved to Vercel.                                                                              |
| 2026-11-02 | The CSP has no Supabase host until Phase 5.                                           | The spec value is a placeholder.                                                                      |
| 2026-11-02 | Routes arrive in the phase that builds their screen.                                  | No placeholder screens (section 0, rule 8).                                                           |
| 2026-11-02 | Paper adds `--accent-text: #B83E28`.                                                  | `#C8452D` on `#F5F1E8` is 4.29:1 and fails WCAG AA for body text.                                     |
| 2026-11-02 | Sepia adds surface `#F6ECD9`, muted `#6E5D48`, rule `#DCCBAA`.                        | The spec gives only three Sepia colors.                                                               |
| 2026-11-02 | TypeScript 6.0, not 7.0.                                                              | typescript-eslint 8.72 supports TypeScript below 6.1.                                                 |
| 2026-11-02 | ESLint 9.39, not 10.                                                                  | eslint-plugin-jsx-a11y 6.10 supports ESLint up to 9.                                                  |
| 2026-11-02 | The CSP adds `manifest-src 'self'`.                                                   | Tighter than the `default-src` fallback, same effect.                                                 |
| 2026-11-02 | `/assets/*` gets `Cache-Control: public, max-age=31536000, immutable`.                | File names carry a content hash.                                                                      |
| 2026-11-02 | The SPA rewrite skips `/assets/`, `/icons/`, `/sw.js`, `/workbox-*` and the manifest. | A missing file must return 404, never `index.html`, or the service worker can cache HTML as a script. |
| 2026-11-02 | The WebKit offline test fails every request with routing instead of `setOffline`.     | Playwright's WebKit cannot navigate under `setOffline` while a service worker answers.                |
