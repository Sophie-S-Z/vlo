# M1e: Merge the Lovable landing page

**Goal:** One landing page that keeps our full M1 build and adds the best parts of Praneel's Lovable build, with dynamic motion as the default. Low input lag, smooth scroll, smooth transitions.

**Source:** `Lovable_Vlo_Landing_Page.zip` (TanStack Start, Phase 1 of the same landing spec, still SVG art). Read as data only. We do not take TanStack Start, shadcn/ui, the Supabase JS client, or `lovable-error-reporting.ts`.

**Praneel's answers (2026-10-30):** 1B 2A 3A 4A 5A 6a,b,c,d.

## Tasks

1. **Dynamic by default (1B).** `reduced` follows only Calm. A system reduced-motion setting gives `gentle` mode: effects run, but no velocity skew, card tilt, camera parallax, page-turn wipes or ink trail. A one-tap "Turn on Calm" offer shows once on those devices. `data-motion` is `full`, `gentle` or `reduced`. `public/entry.js` sets it before the first paint. Tests: `MotionPreferences.test.tsx`, `CalmOffer.test.tsx`, `motion.spec.ts`. E2E specs that need the still page turn Calm on through storage.
2. **Entry in about 1.5 s (5A) and sound by default (6d).** The curtain lines and buttons arrive within 1 s. The curtain opens by itself at 1.5 s once loading ends. Sound is on by default: "Enter with sound" starts it, and otherwise it starts on the first click or key press, unless the visitor turned it off (`vlo:sound`). Tests: `Entry.test.tsx`, `sound.test.ts`, `entry.spec.ts`, `sound.spec.ts`.
3. **Motion springs (3A).** `motion/mini` `animate` with a spring drives the hero rotating word, the book captions, the AI card-to-dialog open and the waitlist "I write" marker. Tests: unit tests with an injected animator, e2e for the dialog.
4. **Waitlist form polish (4A).** Floating email label (CSS only) and a sliding marker under the active "I write" option. Tests: `WaitlistForm.test.tsx`, axe.
5. **The book opens (2A).** On full motion the section pins for four screens. Captions change per step. The particle book lifts its pages apart with scroll. A circle iris turns the section from Ink to Paper at the end. Calm keeps the still list. Tests: `landing-motion.spec.ts` (pin, captions, iris, Calm unpins).
6. **Your first line (6a).** A hero field "Type your first line". The particles form the typed words in place of the wordmark. The text stays in memory on the device and never goes to the network or storage. Still fallback: the typed line shows in the hero art. Tests: `firstLine.test.ts`, `shapes.test.ts`, `field.spec.ts`.
7. **Page-turn wipes (6b).** As a section enters, a page-colored sheet turns away from its left edge (transform only, scrubbed). Off in gentle and Calm. Test: `landing-motion.spec.ts`.
8. **Ink trail (6c).** A short fading accent stroke follows a fine pointer on a small 2D canvas. The loop sleeps when the pointer rests. Off in gentle, Calm and on touch. Test: `landing-motion.spec.ts`.
9. **Speed pass.** Lenis tuned for touch and wheel, passive listeners, `will-change` only while moving, transform-only scrubs. Gate: Lighthouse TBT, LCP and accessibility budgets; no long task over 50 ms on scroll in a trace.

## Gate

`npm run lint`, `format:check`, `typecheck`, `test`, `build`, `check:bundle`, `test:e2e`, `lhci` all pass. A code review finds no open issue. Praneel approves the look on the preview.
