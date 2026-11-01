# 0003. Build the landing page first

Date: 2026-10-30. Status: accepted.

## Context

Section 22 orders the landing page and waitlist (M1) before the writing app (M2). The waitlist collects sign-ups during the build.

## Decision

- `/` ships first. `/app/*` stays behind `VITE_APP_ENABLED`. Only the exact string `"true"` turns it on, and the landing page links to `/app` only then.
- Routes other than `/` load as lazy chunks, so the landing page carries no app code.

## Consequences

- The human turns on `VITE_APP_ENABLED` in Cloudflare Pages only at launch (M6).
- When the flag is off, the `/app` route is absent and the 404 page answers.

## Amendment (M0 review)

`src/appLoader.ts` compares `import.meta.env.VITE_APP_ENABLED === "true"` inline, so the build drops the app chunk when the flag is off. A flag-off build must contain no `src/app/` module; `npm run check:bundle` fails otherwise. `src/appLoader.test.ts` checks the flag values.

## Amendment (M0 CI): prerender the landing page

Lighthouse CI measured LCP at 3.0 s on CI runners because the headline appeared only after React rendered. The build now prerenders `/` (`src/entry-server.tsx`, `scripts/prerender.mjs`) into `dist/index.html`, and the client hydrates it. Other routes render on the client. The router's inline hydration script is off (`hydrate={false}`) to keep `script-src 'self'`. Stored preferences (theme, Calm) read through `useSyncExternalStore` with a server snapshot, so hydration never mismatches.
