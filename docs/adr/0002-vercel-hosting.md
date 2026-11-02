# ADR 0002: Host on Vercel

- Status: accepted
- Date: 2026-11-02
- Replaces: Cloudflare Pages in spec sections 4, 12 and 14

## Context

The spec names Cloudflare Pages. The product owner chose Vercel, with builds from the GitHub repository. The marketing site already runs on Vercel.

## Decision

- Vercel builds the static app with `npm run build` and serves `dist/`.
- `vercel.json` holds the security headers from spec section 12 and rewrites every path to `/index.html`, so client routes load on a direct visit.
- `public/_headers` does not exist.
- Each pull request gets a Vercel preview deployment.

## Consequences

- The Hobby plan is free and allows non-commercial use only. Vlo is free, so this fits at launch.
- Vercel preview pages can inject a feedback toolbar script. The CSP blocks it. This is intended.
- Production deploys still need the product owner's approval (spec section 0, rule 12).
