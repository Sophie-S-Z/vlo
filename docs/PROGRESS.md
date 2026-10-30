# Progress

## Current milestone

M1: Landing page and waitlist. Plan: `docs/plans/M1.md`. Branch: `claude/project-thread-mnsg2f`. Draft PR #2.

## Done (M1a so far)

- Waitlist migration with SQL tests run as anon (`npm run test:sql`, ADR 0007).
- `src/net/` request wrapper and metadata-only log; waitlist RPC client.
- All ten landing sections as prerendered static HTML with section 20 copy and still SVG art.
- Lazy effects chunk (`src/landing/effects/`): Lenis, ink line, page counter, nav hide, logo morph, link scramble, cursor, magnetic buttons, tilt, headline reveal, manifesto fill, velocity skew, marquees. Loads one frame after hydration, only when motion is not reduced. Calm tears it all down (`tests/e2e/landing-motion.spec.ts`).
- Demos: bento motion, FAQ height transition (CSS), AI card grows into its dialog.
- "Hold to sign" (US16): a pointer holds 1.2 s while a ring fills; keyboard, assistive tech and reduced motion submit at once.
- Code review done; fixes in commit "fix(landing): address M1a review findings".
- Bundle guardrail also blocks gsap, lenis, motion and the effects code from the initial chunks. Initial JS 116.5 KB gzipped; effects chunk 71 KB gzipped.
- M1b so far: WebGL glyph particle field (`src/gl/`, ADR 0008). Seven shapes morph with scroll and gather where each section's still art sits. Bloom, vignette, velocity aberration. The footer wordmark snaps to a character grid. On desktop the cursor stirs vermilion ink in the hero (`src/gl/fluid.ts`, MIT notice in `THIRD_PARTY_NOTICES.md`). No canvas with Calm, reduced motion, no WebGL, a software renderer, or below about 22 fps; the still art shows instead. The three.js chunk is 147 KB gzipped and loads last.
- M1b review done. Fixed: the frame guard ignores pauses (hidden tab, shader compile); the page top rests on the wordmark; anchors follow layout changes; the atlas waits for fonts; a failed start frees the GPU context. Lighthouse (5 runs): LCP 1.54 to 1.56 s, accessibility 1.0, TBT 330 to 551 ms.
- M1c: Three forms pins on wide screens and its panels move in one row (phones keep a stack). Novel board: draggable scene cards with inertia, threads that follow, Grid/Board switch with Flip. Memoir: alias names that scramble on hover and switch on click, an export preview, a drawn timeline. Poetry: the poem types itself with exact indents and hand-counted syllables; 30 word tiles under Matter.js (own 27 KB chunk, loads near the box). Privacy: Pen/Reader/Co-writer switch with a spring marker and morphing badge, a "Requests to Vlo servers: 0" odometer, a flashlight reveal. First lines: an endless draggable grid; blank cards zoom to full screen and land on the waitlist email field; marquees follow scroll speed and slow under the pointer.
- M1c review done (8 findings, all fixed): marquee speed control never ran, fast mode switches could leave the wrong icon, focus in clipped areas, stale layout after a breakpoint, Flip styles left after Calm, older-browser fallback for the alias text, Matter wall mass, scramble tweens that raced. Section demos now start one per task after the first screen, and `html[data-effects=ready]` marks the end.
- Deferred to M1b polish: cursor-driven font weight, vanishing-point line in the Manifesto, magnetic fill from the entry point, copy-link check tile.

## Done (M0)

- Plan written.
- Scaffold: Vite 8, React 19, TypeScript 6.0 strict, Tailwind 4, shadcn/ui config, React Router 7 (ADR 0001).
- Design tokens for Ink, Paper, Night, Sepia; self-hosted Fraunces, Newsreader, Inter, JetBrains Mono.
- Calm mode and reduced-motion provider; theme provider with circular reveal (ADR 0005).
- Routes `/`, `/app/*` (behind `VITE_APP_ENABLED`), `/share/:id`, `/privacy`, `/ai-policy`, 404 (ADR 0003).
- CSP meta tag, security headers, SPA fallback for Cloudflare Workers static assets (ADR 0006).
- Bundle guardrail (`npm run check:bundle`): initial JS 106 KB gzipped, budget 250 KB.
- Playwright e2e with axe on every route and every theme, desktop and 360 px.
- Lighthouse CI: median LCP 1.5 s locally (budget 2.5 s), accessibility 1.0.
- GitHub Actions CI.
- CLAUDE.md, this file, ADRs 0001 to 0006.

## Gate status (M1c, internal step before the M1 gate)

| Check                                                              | Status                                                     |
| ------------------------------------------------------------------ | ---------------------------------------------------------- |
| Unit tests                                                         | Pass: 145 tests                                            |
| E2E with axe, desktop and 360 px, all themes, Calm, reduced motion | Pass: 97 tests                                             |
| Lighthouse (5 runs)                                                | Pass: LCP 1.70 to 1.88 s, accessibility 1.0                |
| Bundle guardrail                                                   | Pass: initial JS 118 KB gzipped; matter-js lazy            |
| Code review                                                        | Done; all findings fixed                                   |
| Total blocking time (warn budget 200 ms)                           | Over: 611 to 673 ms under 4x CPU throttle; see open issues |

## Gate status (M1a, internal step before the M1 gate)

| Check                                                              | Status                                      |
| ------------------------------------------------------------------ | ------------------------------------------- |
| Unit tests                                                         | Pass: 114 tests                             |
| E2E with axe, desktop and 360 px, all themes, Calm, reduced motion | Pass: 60 tests                              |
| Lighthouse                                                         | Pass: median LCP 1.55 s, accessibility 1.0  |
| Bundle guardrail                                                   | Pass: initial JS 117 KB gzipped             |
| Code review                                                        | Done; findings fixed or recorded (ADR 0007) |
| Visual QA                                                          | `docs/qa/screens/m1a-effects-*`             |

## Gate status (M0)

| Check                               | Status                                                                           |
| ----------------------------------- | -------------------------------------------------------------------------------- |
| CI green                            | Pass on PR #1: lint, types, unit, build, bundle, Playwright with axe, Lighthouse |
| Preview URL loads                   | Pass: the human confirmed `/` and `/privacy` load and Calm persists (2026-10-30) |
| Reduced motion and Calm mode toggle | Pass (`tests/e2e/motion.spec.ts`)                                                |

## Waiting on the human

- Supabase project URL and anon key (M1), waitlist reply-to email (M1), domain (M6, optional).

## Section 24 decisions (defaults in use until the human answers)

1. Product owner and approvers: the human (Praneel).
2. Trademark check for "Vlo": proceed; open flag.
3. Open-source the code: keep the repo private; license options in ADR 0004.
4. Phone drafting scope: full editing on phones, with a simplified binder.
5. Waitlist reply-to email: ask; only the consent line blocks.
6. Funding if share storage outgrows free plans: out of scope until usage data exists.
7. Legal review (privacy policy, terms, GSAP license scope, CMU dictionary license): draft and flag.

## Open issues

- Waitlist has no server-side rate limit (ADR 0007).
- Total blocking time is over the 200 ms warn budget. The largest task is the parse of the effects chunk (about 300 ms under 4x throttle). Plan for M1d: split gsap plugins per section so each section loads its own code.

- Trademark check for "Vlo" not done (section 24 item 2).
- `npm audit` advisories in the dev-only `@lhci/cli` tree (ADR 0001).

## Next step

M1a, M1b and M1c done. Next: M1d (entry sequence, Web Audio, origami and plane flight, ticket card, route wipes, 404 physics, Ink lab, gyroscope, frame-rate guard) from `docs/plans/M1.md`. The M1 gate also needs the Supabase URL from the human for a real test sign-up.
