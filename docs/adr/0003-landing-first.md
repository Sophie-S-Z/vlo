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

`src/App.tsx` compares `import.meta.env.VITE_APP_ENABLED === "true"` inline, so the build drops the app chunk when the flag is off. A flag-off build must contain no `src/app/` module except `flags.ts`; `npm run check:bundle` fails otherwise.
