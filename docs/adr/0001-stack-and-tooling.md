# 0001. Stack and tooling versions

Date: 2026-10-30. Status: accepted.

## Context

Section 7 fixes the stack. Several tools had new majors in October 2026, and not all of them work together yet.

## Decision

- Vite 8 (Rolldown), React 19, React Router 7 (`react-router` package, data router with `lazy` routes), Tailwind 4 through `@tailwindcss/vite`.
- TypeScript is pinned to `~6.0`. TypeScript 7 exists, but `typescript-eslint` 8.72 supports only `<6.1.0`.
- Vitest 5 with jsdom and Testing Library. Playwright is pinned to exactly `1.63.0`, with an npm override for `playwright-core`, so the test runner and `@axe-core/playwright` share one browser build.
- ESLint 10 flat config with `--max-warnings 0`. Prettier for format.
- shadcn/ui: `components.json` points generated primitives at `src/ui/primitives` and `cn()` at `src/ui/lib/utils.ts`. Add primitives with `npx shadcn add <name>` when a feature needs one, not ahead of time.
- npm is the package manager. Node 22 (`.nvmrc`).
- Lighthouse CI writes reports to the file system. It never uploads to the public temporary storage, so no report leaves CI.

## Consequences

- `npm audit` reports high advisories in the `@lhci/cli` dependency tree (puppeteer, zod, uuid). They are dev-only and never ship to users. Recheck when `@lhci/cli` updates.
- Move to TypeScript 7 when `typescript-eslint` supports it.
