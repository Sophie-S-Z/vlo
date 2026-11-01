# Code quality and maintainability review

Date: 2026-11-01. Scope: all of `src/`, `scripts/`, `tests/`, `public/`, the build and CI configuration, and `package.json`, on the M1 branch (PR #2, commit `d2df56e`). Decisions: ADR 0014.

## Method

- Read every source file. Ran `knip` (unused files, exports and dependencies) in normal and production mode.
- Compared every `data-*` hook that code queries with the markup that sets it, in both directions. Compared every selector in `src/index.css` with the markup.
- Ran the baseline: lint, format, types, 206 unit tests, build, bundle guardrail and 150 Playwright tests with axe. All passed before the cleanup.

## Summary

The codebase is in good condition. Teardown discipline, the bundle guardrail and the test coverage are strong. The review found one user-visible bug, one flaky test, one test that tested dead code, two unused dependencies, and a few small duplicates. No Lovable files are in the repository: ADR 0012 took the ideas, not the code, and no shadcn/ui primitives exist.

| #   | Finding                                                   | Category        | Action     |
| --- | --------------------------------------------------------- | --------------- | ---------- |
| 1   | The cursor "Hold" label never shows                       | Bug             | Fixed      |
| 2   | `src/app/flags.ts` duplicates the shipped flag check      | Dead, duplicate | Removed    |
| 3   | `@gsap/react` and `class-variance-authority` are unused   | Dead dependency | Removed    |
| 4   | Effects test fails under load and the failure cascades    | Flaky test      | Fixed      |
| 5   | Hero word swap calls `Element.animate` with no check      | Robustness      | Fixed      |
| 6   | Theme swatch colors are written twice                     | Duplicate       | Merged     |
| 7   | Two mask functions repeat the same canvas code            | Duplicate       | Merged     |
| 8   | Unused exports `VLO_EASE`, `MorphSVGPlugin`, `PAGE_COUNT` | Dead code       | Removed    |
| 9   | Five `data-*` hooks that nothing reads                    | Dead markup     | Removed    |
| 10  | 404 page comment says reduced motion stops the letters    | Stale comment   | Fixed      |
| 11  | Exports used only inside their own module                 | Low value       | Kept       |
| 12  | `scramble.ts` beside GSAP ScrambleTextPlugin              | Looks duplicate | Kept       |
| 13  | Items that look unused but have a purpose                 | Not dead        | Kept       |
| 14  | Redundant API calls and database queries                  | Checked         | None found |

## Findings

### 1. The cursor "Hold" label never shows (bug)

- **Why it is wrong:** `src/landing/effects/pointer.ts` labels the cursor ring "Hold" over `[data-hold]`. No element had that attribute. `HoldButton` set `data-holding` only while a pointer held it, and nothing read `data-holding`.
- **Impact of the fix:** The "Hold to sign" button now shows the "Hold" cursor label, as spec 18.1 item 5 asks. One attribute changes.
- **Risk:** None found. No CSS or test read `data-holding`.
- **Cleanup:** `HoldButton` sets a static `data-hold`. A new test in `LandingPage.test.tsx` checks that every cursor label selector matches the landing markup, so a renamed hook fails the unit tests.

### 2. `src/app/flags.ts` duplicates the flag check (dead code, false test confidence)

- **Why it is not needed:** `isAppEnabled()` had no caller outside its test. `src/appLoader.ts` must compare `import.meta.env.VITE_APP_ENABLED === "true"` inline, so the build can drop the app chunk (ADR 0003). The M0 acceptance table ("only the exact string `true` turns the app on") ran against the copy, not against the code that ships. The bundle guardrail also needed a special case for this file.
- **Impact:** One file and one test less. The acceptance table now runs against `appLoader.ts` (`src/appLoader.test.ts`). A mutation check confirmed that the new test fails when the comparison changes. The guardrail regex is now plain `/src/app/`.
- **Risk:** Low. A flag-off build must still contain no `src/app/` module. `npm run check:bundle` enforces it.
- **Cleanup:** Done. ADR 0003 now names `appLoader.ts` and the new test.

### 3. Unused dependencies `@gsap/react` and `class-variance-authority`

- **Why they are not needed:** No file imports them. The effects run outside React through `startLandingEffects` and `gsap.context`, so `useGSAP` has no use. `class-variance-authority` serves shadcn/ui primitives, and none exist.
- **Impact:** Two fewer packages to install, audit and update. The shipped bundle does not change.
- **Risk:** Low. The spec stack lists `@gsap/react`. A milestone that needs it adds it back with the code that uses it. `npx shadcn add` installs `class-variance-authority` when the first primitive arrives.
- **Cleanup:** Done (`npm uninstall`). Recorded in ADR 0014.

### 4. Effects test fails under load, and one failure breaks three more tests

- **Why it is wrong:** `src/landing/effects/index.test.ts` waited for `html[data-effects=ready]` with the 1 s default of `vi.waitFor`. The later effects load through `import()`. On a cold cache or a busy machine the transform takes longer, so the wait timed out. The test then skipped its teardown, and the leftover ScrollTriggers failed the next three tests. The failure showed once in this review and was reproduced with three parallel test runs.
- **Impact of the fix:** The waits allow 10 s and the suite allows 15 s per test. Each started effect set now tears down in `finally`, so one failure stays one failure. The suite passes under the same load that failed before.
- **Risk:** None. A real hang still fails, after 10 s.
- **Cleanup:** Done.

### 5. Hero word swap calls `Element.animate` with no check

- **Why it is wrong:** `rotateWords` in `src/landing/effects/text.ts` calls `rotator.animate()` after 2.4 s. `springTo` and the waitlist flight check for `Element.animate` first; this code did not. Under load the test above ran past 2.4 s and threw an unhandled `TypeError` in jsdom.
- **Impact of the fix:** The swap starts only where `Element.animate` exists, like the other Web Animations code. The page keeps the first word otherwise. Current browsers do not change.
- **Risk:** None.
- **Cleanup:** Done.

### 6. Theme swatch colors are written twice

- **Why it is not needed:** `ThemeSwitch.tsx` and `FeaturesBento.tsx` each held the four theme background colors as hex literals.
- **Impact:** One `THEME_SWATCHES` map in `ThemeProvider.tsx`. A new test in `tokens.test.ts` checks it against each theme's `--vlo-bg` in `tokens.css`, so a palette change cannot drift.
- **Risk:** None. The rendered colors are the same.
- **Cleanup:** Done.

### 7. Two mask functions repeat the same canvas code

- **Why it is not needed:** `drawWordmarkMask` and `drawLineMask` in `src/gl/canvas2d.ts` each created a 360 x 140 canvas, set the same text style and copied the alpha channel.
- **Impact:** One `textMask()` helper holds the shared steps. Each function keeps only its own drawing. The two masks must share one size, and the code now says so once.
- **Risk:** Low. jsdom has no canvas, so unit tests cannot run this code. The Playwright field test (`tests/e2e/field.spec.ts`) runs it in Chromium and passed.
- **Cleanup:** Done.

### 8. Unused exports

- **Why they are not needed:** `VLO_EASE` and the `MorphSVGPlugin` re-export in `src/motion/gsap.ts`, and `PAGE_COUNT` in `src/landing/sections/Page.tsx`, had no importer. Effects use the ease by its name, `"vlo"`.
- **Impact:** Smaller public surface. The ease and the plugin still register.
- **Risk:** None. Types and the e2e suite check the result.
- **Cleanup:** Done.

### 9. Unused `data-*` hooks

- **Why they are not needed:** `data-snapshot-slider`, `data-snapshot-value`, `data-tilt-button`, `data-ink-lab` and `data-ink-lab-button` had no reader in code, CSS or tests.
- **Impact:** Less markup that suggests a contract that does not exist.
- **Risk:** None found. Tests reach these controls by role and name.
- **Cleanup:** Done.

### 10. Stale comment on the 404 page

- **Why it is wrong:** The comment said reduced motion stops the falling letters. Since ADR 0011 only Calm stops them; gentle mode keeps them.
- **Cleanup:** Comment corrected. Behavior does not change.

### 11. Exports used only inside their own module (kept)

`knip` lists 24 exports and 13 interfaces that only their own module or a test uses, such as `SOUND_KEY`, `HOLD_MS`, `FIELD_FORCE_KEY` and `MIN_SHOWN_COUNT`. Most are test seams or named constants that tests import. Removing `export` saves nothing at run time and makes tests reach for magic numbers. Recommendation: keep.

### 12. `scramble.ts` beside the GSAP ScrambleTextPlugin (kept)

The memoir names write their visible text through `data-text` and CSS `content`, so the effect never replaces nodes that React owns (see the M1c review notes). The plugin writes into the element. `scrambleText()` is 15 lines with its own tests. Recommendation: keep.

### 13. Items that look unused but have a purpose (kept)

- `public/entry.js` and `src/entry-server.tsx`: `index.html` and the build script load them; `knip` cannot see that.
- `@tweakpane/core`: the `tweakpane` type definitions import it.
- `components.json`, `clsx`, `tailwind-merge`, `cn()`: in use, and ADR 0001 keeps the shadcn/ui setup.
- `getNetLog` and `subscribeNetLog`: the visible network log (spec F25) has no screen yet. Keep for the app milestones.
- `WaitlistForm`'s `contactEmail` prop: waits for the human's reply-to email (spec section 3).
- `docs/qa/` screenshots (2 MB): gate evidence for M0 and M1a.

### 14. Redundant API calls and database queries (none found)

The site makes two kinds of request, both through `src/net/`: one `waitlist_count` call per landing view, and one `join_waitlist` call per sign-up. Neither retries, and with no Supabase settings neither leaves the device. The SQL migration has one table and two functions, with tests. Nothing to remove.

## Remaining technical debt (recommendations, not done)

- `npm audit` lists advisories in the dev-only `@lhci/cli` tree (known, ADR 0001). Recheck when `@lhci/cli` releases a new version.
- The landing page has no server-side rate limit on the waitlist (ADR 0007). Add one before launch if abuse shows up.
- `src/landing/effects/forms.ts` (390 lines) holds four effects. Split it if it grows again; today the split would only move code.

## Verification

Lint, format, types, unit tests, build, bundle guardrail and the Playwright suite with axe all pass after the cleanup. Exact counts are in `docs/PROGRESS.md`.
