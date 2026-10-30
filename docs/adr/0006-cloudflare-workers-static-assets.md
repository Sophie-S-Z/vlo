# 0006. Deploy as Cloudflare Workers static assets

Date: 2026-10-30. Status: accepted.

## Context

The spec names Cloudflare Pages. The human created a Cloudflare Workers Builds project (`vlo`) connected to the repository. Workers static assets give the same free static hosting and per-branch previews.

## Decision

- Deploy with `wrangler.jsonc`: assets only, directory `./dist`, `not_found_handling: "single-page-application"`.
- Remove `public/_redirects`. The SPA fallback replaces the Pages-style `/* /index.html 200` rule, which Workers asset rules can reject as a loop.
- Keep `public/_headers`. Workers static assets read it.

## Consequences

- Static asset requests are free and unlimited on the Workers free plan; no Worker script runs, so no request counts against Worker limits.
- If the human moves to a Pages project later, add back `_redirects` with `/* /index.html 200`.
