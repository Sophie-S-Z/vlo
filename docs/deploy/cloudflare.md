# Cloudflare deploy

The human owns the Cloudflare account (spec section 3, item 2). Free plan.

The project is a Cloudflare **Workers Builds** project named `vlo`, connected to the GitHub repository. It serves the built `dist` folder as static assets with no Worker script. Cloudflare now steers new static sites to Workers static assets; this matches the spec's "Cloudflare Pages" intent (static hosting, free plan, a preview per branch). See ADR 0006.

## Build settings

| Setting                              | Value                          |
| ------------------------------------ | ------------------------------ |
| Build command                        | `npm run build`                |
| Deploy command                       | `npx wrangler deploy`          |
| Non-production branch deploy command | `npx wrangler versions upload` |
| Root directory                       | `/`                            |
| Node version                         | from `.nvmrc` (22)             |
| Build variable `VITE_APP_ENABLED`    | `false` until launch           |

## Files that Cloudflare reads

- `wrangler.jsonc`: asset directory `./dist` and `not_found_handling: "single-page-application"`, so deep links such as `/privacy` load the single-page app.
- `public/_headers` (copied to `dist`): security headers and long caching for hashed assets.

The Content Security Policy is a meta tag that the build adds to `index.html` (`scripts/csp.ts`).

## Later milestones

- M1: add the Supabase URL and anon key as build variables (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`). Never commit them.
- M6: custom domain, if the human wants one.
