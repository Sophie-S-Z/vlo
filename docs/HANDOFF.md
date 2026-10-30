# Handoff

Updated: 2026-10-30.

## Done

- M0 complete; PR #1 merged.
- M1a to M1d are done on `claude/project-thread-mnsg2f`, draft PR #2. Details and gate tables: `docs/PROGRESS.md`.
- M1e (merge with Praneel's Lovable landing page) is done on the same branch. Plan `docs/plans/M1e.md`; ADRs 0011 to 0013.

## In progress

- The M1 gate. It waits on the human: the Supabase URL (Cloudflare build variables `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`; the human sends only the URL in chat) and approval of the look. After both, run a real test sign-up on the preview and record the gate in `docs/PROGRESS.md`. Then M2 per spec section 22.

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
- Section demos load through `import()` from `src/landing/effects/index.ts`. Plugins that only they use (Draggable, Inertia, Flip, DrawSVG) register in `src/motion/gsapPlus.ts`; import them from there.
- First-load motion (sign-up flight, shake, route wipe, grain) uses the Web Animations API or CSS, never gsap (ADR 0010).
- `playwright.config.ts` sets `vlo:entered=1` so the entry curtain stays away; `tests/e2e/entry.spec.ts` clears it.
- Run axe on a still page (Calm, through `startInCalm` in `tests/e2e/calm.ts`) when the subject is not the motion itself; a scroll fade caught halfway fails color contrast.
- ADR 0011: `prefers-reduced-motion` no longer stops the effects. It gives gentle mode (`html[data-motion=gentle]`, `gentleMotion()` in effects). Only Calm (`reduced`) stops them. `emulateMedia({ reducedMotion: "reduce" })` in a test now means gentle mode.
- ADR 0013: the effects wait for all five `Deferred` Suspense boundaries to hydrate. A new section below the hero goes inside one of them. Pins start first in `LATER`; an effect that changes a section's height starts right after the pins.
- `lenis.resize()` runs after each ScrollTrigger refresh and before each glide; without it, glides stop short after the pins add spacers.
- Never `pkill -f "vite preview"`: it kills the shell that runs it.
- A ScrollTrigger refresh moves each pin out of its spacer and back, which drops focus. `keepFocus()` in `src/landing/effects/index.ts` gives focus back; keep it when you add pins.
