# Handoff

Updated: 2026-10-30.

## Done

- M0 Foundation is complete and its gate passed (see `docs/PROGRESS.md`). PR #1 (`claude/project-thread-mnsg2f` into `main`) waits for the human to merge it.

## In progress

- M1 (landing page and waitlist). Next: write `docs/plans/M1.md` from spec sections 18, 19, 20 and 22 (M1a to M1d).

## Exact next commands

```bash
git fetch origin main && git checkout -B claude/project-thread-mnsg2f origin/main   # only after PR #1 merges
npm ci
npm test && npm run lint && npm run typecheck
npm run build && npm run check:bundle && npm run test:e2e
CHROME_PATH=/opt/pw-browsers/chromium-1243/chrome-linux64/chrome npm run lhci       # cloud sandbox path
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
