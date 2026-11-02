# Vlo status

Last update: 2026-11-02

## Done

- Spec saved as `docs/VLO_SPEC.md`.
- Section 17 questions answered.
- Phase 0 plan approved (`docs/plans/phase-0.md`).

## In progress

- Phase 0: Foundation, on branch `phase-0-foundation`.

## Blocked

- Nothing.

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

| Date       | Change                                                         | Reason                                                            |
| ---------- | -------------------------------------------------------------- | ----------------------------------------------------------------- |
| 2026-11-02 | `vercel.json` replaces `public/_headers`.                      | Hosting moved to Vercel.                                          |
| 2026-11-02 | The CSP has no Supabase host until Phase 5.                    | The spec value is a placeholder.                                  |
| 2026-11-02 | Routes arrive in the phase that builds their screen.           | No placeholder screens (section 0, rule 8).                       |
| 2026-11-02 | Paper adds `--accent-text: #B83E28`.                           | `#C8452D` on `#F5F1E8` is 4.29:1 and fails WCAG AA for body text. |
| 2026-11-02 | Sepia adds surface `#F6ECD9`, muted `#6E5D48`, rule `#DCCBAA`. | The spec gives only three Sepia colors.                           |
| 2026-11-02 | TypeScript 6.0, not 7.0.                                       | typescript-eslint 8.72 supports TypeScript below 6.1.             |
| 2026-11-02 | ESLint 9.39, not 10.                                           | eslint-plugin-jsx-a11y 6.10 supports ESLint up to 9.              |
