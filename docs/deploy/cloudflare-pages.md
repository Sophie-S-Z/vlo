# Cloudflare Pages

The human owns the Cloudflare account (spec section 3, item 2). Free plan.

## Build settings

| Setting                                 | Value                |
| --------------------------------------- | -------------------- |
| Framework preset                        | None (or Vite)       |
| Build command                           | `npm run build`      |
| Build output directory                  | `dist`               |
| Root directory                          | (empty)              |
| Environment variable `NODE_VERSION`     | `22`                 |
| Environment variable `VITE_APP_ENABLED` | `false` until launch |

Branch control: production branch `main`. Preview branches: all non-production branches, so each pull request gets a preview URL.

## Files that Pages reads

- `public/_redirects`: `/* /index.html 200`, so deep links such as `/privacy` load the single-page app.
- `public/_headers`: security headers and long caching for hashed assets.

The Content Security Policy is a meta tag that the build adds to `index.html` (`scripts/csp.ts`).

## Later milestones

- M1: add the Supabase URL and anon key as environment variables (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`). Never commit them.
- M6: custom domain, if the human wants one.
