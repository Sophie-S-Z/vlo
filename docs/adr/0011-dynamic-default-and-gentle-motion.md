# 0011: Dynamic motion by default, with gentle motion for reduced-motion devices

Date: 2026-10-30. Status: accepted. Amends ADR 0005.

## Context

Praneel tested the landing page on a device that asks for reduced motion. The page opened in its still form, and Praneel asked for the dynamic page as the default (decision 1B on 2026-10-30). Principle 4 asks every effect to obey reduced-motion settings.

## Decision

- Only the Calm switch turns effects off. `reduced` in `useMotionPreferences()` now means "Calm is on".
- A system reduced-motion setting gives `gentle` mode. Effects run, but the motions that most often cause discomfort stay off: velocity skew, card tilt and gyroscope parallax, camera parallax, page-turn wipes and the ink trail. `<html data-motion>` is `full`, `gentle` or `reduced`.
- On a gentle device, a small notice offers Calm with one tap. It shows once per device (`vlo:calm-offer`).
- `public/entry.js` writes `data-motion` before the first paint, so CSS never flashes the wrong mode. The old `prefers-reduced-motion` media query in `index.css` is gone; `[data-motion="reduced"]` stops CSS motion.

## Consequences

- Visitors who ask their system for less motion still see motion, but less of it, and can turn it all off at once.
- Effect code reads `gentle` as well as `reduced`. Reviewers check both.
- E2E tests that need the still page turn Calm on through storage, not through `emulateMedia`.
