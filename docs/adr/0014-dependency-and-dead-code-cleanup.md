# 0014: Remove unused dependencies and the unused app flag helper

Date: 2026-11-01. Status: accepted.

## Context

A code quality review (`docs/reviews/2026-11-01-code-quality.md`) found two dependencies that no source file imports, and a flag helper that only its own test used.

- `@gsap/react` is in the spec stack (section 7), but the landing effects run outside React through `startLandingEffects` and `gsap.context`. No file imports `useGSAP`.
- `class-variance-authority` came with the shadcn/ui scaffold (ADR 0001). No shadcn/ui primitive exists yet, and the Lovable merge (ADR 0012) took none.
- `src/app/flags.ts` (`isAppEnabled`) duplicated the check in `src/appLoader.ts`. The build must compare `import.meta.env.VITE_APP_ENABLED` inline to drop the app chunk (ADR 0003), so production never called the helper. Its table test tested a copy of the logic, not the code that ships.

## Decision

- Remove `@gsap/react` and `class-variance-authority` from `package.json`.
- Keep `components.json`, `clsx` and `tailwind-merge`: `cn()` uses them, and ADR 0001 adds shadcn/ui primitives when a feature needs one. `npx shadcn add` installs `class-variance-authority` again at that time.
- Keep `@tweakpane/core`: the `tweakpane` type definitions import it.
- Delete `src/app/flags.ts` and its test. `src/appLoader.test.ts` runs the same table against `appLoader.ts`. The bundle guardrail now forbids every `src/app/` module in a flag-off build.

## Consequences

- Fewer packages to install and audit. The shipped bundle does not change: neither package was imported.
- A milestone that needs `useGSAP` adds `@gsap/react` back in the same commit that uses it.
