# Progress

## Current milestone

M0: Foundation. Plan: `docs/plans/M0.md`. Branch: `claude/project-thread-mnsg2f`.

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

## Gate status (M0)

| Check                               | Status                                      |
| ----------------------------------- | ------------------------------------------- |
| CI green                            | Pending first run on the PR                 |
| Preview URL loads                   | Pending the Workers Builds preview on PR #1 |
| Reduced motion and Calm mode toggle | Pass (`tests/e2e/motion.spec.ts`)           |

## Waiting on the human

- Cloudflare preview URL for this branch (section 3, item 2).
- Later: Supabase project URL and anon key (M1), waitlist reply-to email (M1), domain (M6, optional).

## Section 24 decisions (defaults in use until the human answers)

1. Product owner and approvers: the human (Praneel).
2. Trademark check for "Vlo": proceed; open flag.
3. Open-source the code: keep the repo private; license options in ADR 0004.
4. Phone drafting scope: full editing on phones, with a simplified binder.
5. Waitlist reply-to email: ask; only the consent line blocks.
6. Funding if share storage outgrows free plans: out of scope until usage data exists.
7. Legal review (privacy policy, terms, GSAP license scope, CMU dictionary license): draft and flag.

## Open issues

- Trademark check for "Vlo" not done (section 24 item 2).
- `npm audit` advisories in the dev-only `@lhci/cli` tree (ADR 0001).

## Next step

Code review of M0, then open the PR and confirm CI. After the gate passes, start M1a.
