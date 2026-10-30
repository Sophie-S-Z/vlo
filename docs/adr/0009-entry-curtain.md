# 0009: Entry curtain on the first visit only

## Context

Spec section 18 asks for an entry sequence (p.00) with a progress count, a drawn logo and a choice to enter with or without sound. A curtain over the page can hide the largest paint and hurt LCP (budget 2.5 s). The CSP allows only `script-src 'self'`, so the page cannot run an inline script before paint.

## Decision

- `public/entry.js` runs as a blocking same-origin script in `<head>`. It sets `html[data-entry=first]` only on `/`, on the first visit (`vlo:entered` not set), and when Calm and reduced motion are off.
- CSS shows the curtain only under that flag. A CSS failsafe hides it after 12 s if the React code never starts.
- The prerendered page stays under the curtain, so the hero text still paints and counts for LCP.
- "Skip intro", Escape and both enter buttons store `vlo:entered=1`. Only "Enter with sound" turns sound on, because a click is the gesture that a browser needs to start audio.
- Playwright sets `vlo:entered=1` by default. `tests/e2e/entry.spec.ts` clears it to test the curtain.

## Consequences

- Return visits, Calm, reduced motion and other routes never see the curtain or wait for it.
- Lighthouse runs a first visit with the curtain on: LCP 1.69 to 1.72 s over 5 runs, accessibility 1.0.
- `entry.js` adds one small request before first paint.
