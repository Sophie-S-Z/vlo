# 0008: Plain three.js for the landing canvas

## Context

Spec section 18 asks for one persistent WebGL canvas behind the landing HTML, with a glyph particle field, post-processing and an ASCII pass. Section 4 lists three, React Three Fiber, drei and `postprocessing`. The landing effects already run as one imperative module that GSAP drives and that Calm tears down in one call (ADR 0005).

## Decision

- The landing canvas uses plain `three` and `postprocessing`, inside the lazy effects chunk. It does not use React Three Fiber.
- React Three Fiber and drei stay the choice for 3D inside the writing app (planning and progress views), where scenes live in React state.
- `three` is pinned to 0.186.x, because `postprocessing` 6.39 supports `three` below 0.187.

## Consequences

- The landing canvas has no React reconciler cost, and its teardown is one `dispose` path next to the GSAP teardown.
- Two styles of 3D code exist in the repo. The app code (M3 and later) must not import `src/gl/` landing modules.
- Upgrading `three` past 0.186 waits for a `postprocessing` release that supports it.
