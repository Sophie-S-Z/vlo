# 0012: Merge the Lovable landing page

Date: 2026-10-30. Status: accepted.

## Context

Praneel built a second landing page in Lovable from the same landing spec. It covers Phase 1 only and uses still SVG art. Praneel asked us to merge the best parts of both and answered six questions (1B 2A 3A 4A 5A 6a,b,c,d).

## Decision

- Our build stays the base: Vite, React Router, prerendered HTML, the WebGL field, `src/net/` for every request.
- We do not take TanStack Start, shadcn/ui, the Supabase JS client or Lovable's error reporting. The error reporter hands errors and page paths to a Lovable-injected tracker (`window.__lovableEvents`), which breaks rule 8 (no analytics or trackers).
- We take from Lovable: the pinned "book opens" story with the Ink-to-Paper iris, spring motion for text swaps and the AI card, the floating email label and the sliding "I write" marker.
- Spring motion uses `motion/mini` (`animate` with `type: spring`, MIT). It runs on the Web Animations API, so it fits ADR 0010 and adds little to the first load. We do not use the React components of Motion.
- New parts: the visitor's own first line forms the particles (the text stays in page memory), page-turn wipes, a cursor ink trail, a 1.5 s entry, and sound on by default after the first interaction.

## Consequences

- One codebase, one deploy, one test suite. Lovable's project is a reference only and is not committed.
- Sound now starts by default after the first click or key press. The sound switch and Calm still turn it off, and the choice is stored (`vlo:sound`).
