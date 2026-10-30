# Handoff

Updated: 2026-10-30.

## Done

- M0 complete; PR #1 merged.
- M1a, M1b and M1c are done on `claude/project-thread-mnsg2f`, draft PR #2 (CI green on 4bc6eec). Details and gate tables: `docs/PROGRESS.md`.

## In progress

- M1d. Scope in `docs/plans/M1.md` ("M1b, M1c, M1d" list) and spec 18.1 and 18.3: entry sequence (p.00), Web Audio sound with the four-bar toggle, origami fold and plane flight with the ticket card after sign-up, route wipes for `/privacy` and `/ai-policy`, 404 Matter.js letters, Ink lab (Tweakpane on "~"), gyroscope parallax on phones, the full frame-rate guard (18.4: under 40 fps for 2 s halves particles and stops the fluid). Also the deferred polish items in PROGRESS and the TBT open issue.
- First step: write the "M1d detail" section in `docs/plans/M1.md`.
- The M1 gate needs the Supabase URL (human) for a real sign-up, and the human's approval of the look.

## Exact next commands

```bash
npm ci
npm test && npm run lint && npm run typecheck && npm run format:check
npm run build && npm run check:bundle && npm run test:e2e
CHROME_PATH=/opt/pw-browsers/chromium npm run lhci
```

## Known traps

- Cloudflare is a Workers Builds project (not Pages). `wrangler.jsonc` needs the `previews` block, or branch deploys fail. See ADR 0006 and `docs/deploy/cloudflare.md`.
- The sandbox proxy blocks `*.workers.dev`. Ask the human to check preview URLs. Pattern: `<branch-slug>-vlo.sophieszhang-ssz.workers.dev`.
- The build prerenders `/` (`src/entry-server.tsx`, `scripts/prerender.mjs`). Anything on the landing page must render on the server: no `window` access during render. Read stored preferences through `src/ui/lib/storedValue.ts`.
- Web fonts load after the first paint (`src/main.tsx`). Moving them back into the critical path pushed CI LCP to 3.0 s.
- Vite must never inline fonts as `data:` URIs (CSP `font-src 'self'`).
- Playwright is pinned to 1.63.0 with an override for `playwright-core`, to match the sandbox Chromium.
- `typescript` stays on `~6.0` until `typescript-eslint` supports 7.
- The user wants ASD-STE100 Simplified Technical English in every message.
- Landing effects: `src/landing/effects/index.ts` starts FIRST effects at once and LATER ones one per task; `html[data-effects=ready]` marks the end. E2E helpers wait for it. A ScrollTrigger below the Three forms pin must be created after `formsTrack`.
- Effects must never replace React's nodes: use `setText`, `keepChildren`, or effect-owned `data-text` with CSS `content: attr(data-text) / ""` (plus a plain fallback line).
- GSAP absorbs a CSS `translate` into its transform cache and can write it back as an inline transform after teardown. Do not center draggable or tweened elements with Tailwind `translate` classes.
- The nav hides on scroll; e2e tests use the Calm switch by focus and Space, not click.
- The `vite preview` server started in the background stops at its time limit; Playwright starts its own server when none runs.
- Heavy libraries load only through `import()`: three and postprocessing (`src/gl/`), matter-js (`src/landing/physics/`). `npm run check:bundle` enforces it.
