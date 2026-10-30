# 0010: Small motion outside the effects chunk, and Tweakpane for the Ink lab

## Context

M1d adds motion that lives outside the landing effects chunk: the sign-up fold and plane flight, the ticket, the error shake, the route wipe, the film grain and the 404 letters. The bundle guardrail keeps gsap out of the first load, and the waitlist form and the route shell are in the first load. Spec section 18.3 names a MotionPath curve for the plane. Spec section 4 names Tweakpane for the hidden Ink lab.

## Decision

- One-shot motion in first-load code uses the Web Animations API or CSS keyframes, not gsap. The plane follows a cubic Bezier curve that `flightFrames` samples into keyframes, with the nose along the tangent. This gives the MotionPath result without the plugin.
- The 404 letters reuse the Matter.js tile world from the word tiles (`src/landing/physics/magnets.ts`), loaded through `import()`.
- The Ink lab uses `tweakpane` 4 (MIT), loaded through `import()` only when the visitor opens the lab. `@tweakpane/core` (MIT) is a dev dependency for its types. The panel adds accessible names to the Tweakpane inputs.
- Ink lab values last for one page view and live in `src/landing/lab/settings.ts`. The particle field, the grain and the ink color subscribe to them.

## Consequences

- The first load grows by about 2 KB gzipped (122 KB in total), with no new library in it.
- Effects in the first load check `useMotionPreferences().reduced` and `Element.prototype.animate` before they run.
- A Tweakpane upgrade must keep the accessible-name patch in `src/landing/lab/panel.ts` working; `tests/e2e/lab.spec.ts` runs axe on the open panel.
