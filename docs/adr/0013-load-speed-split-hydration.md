# 0013: Split hydration and lighter effect start-up

Date: 2026-10-30. Status: accepted.

## Context

Praneel asked for no lag (M1e). Lighthouse measured a total blocking time of 538 to 733 ms on the pre-merge build, over the 200 ms budget. A CPU profile at 4x slowdown showed three causes: one long React hydration task, Draggable measuring every novel card at start-up (about 370 ms), and a full ScrollTrigger refresh at the end of the effect queue (about 120 ms).

## Decision

- The landing sections below the hero sit in five Suspense boundaries (`src/landing/Deferred.tsx`). React hydrates each boundary in its own task. The effects start only after every boundary has hydrated (`hydrationGate.ts`), because an effect that changes a section's DOM before hydration would break it.
- The novel board creates its Draggables on the first press on a card, then starts that drag at once.
- The pins start first in the effect queue, then the effect that changes a section's height. Every later ScrollTrigger measures the final layout when it starts, so the queue ends without a full refresh. A ResizeObserver refreshes all triggers once, 200 ms after the page height changes.
- Effects read transforms before they write them, so a batch of tweens costs one style recalculation.

## Consequences

- Lighthouse total blocking time: median 138 ms (88 to 292 ms over five runs). LCP stays at 1.66 s, accessibility at 1.0.
- An effect that changes layout must start before the triggers below it, or rely on the layout watch.
