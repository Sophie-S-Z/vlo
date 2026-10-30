# 0005. Theme and motion preferences

Date: 2026-10-30. Status: accepted.

## Context

Section 16 defines four themes and section 5 requires a static fallback for every effect. Later effect code (GSAP, Lenis, WebGL, Web Audio) needs one source of truth for "may this move?".

## Decision

- `MotionPreferencesProvider` (`src/motion/`) combines the Calm switch (stored as `vlo:calm`) and `prefers-reduced-motion`. It exposes `reduced` and writes `data-motion="reduced|full"` and `data-calm` on `<html>`. CSS under `[data-motion="reduced"]` stops all CSS animation and transition. Effect code must check `useMotionPreferences().reduced` before it starts.
- `ThemeProvider` takes a scope. The landing scope (`/`, `/privacy`, `/ai-policy`, 404) defaults to Ink. The app scope (`/app`, `/share`) defaults to Paper. Each scope stores its own choice (`vlo:theme:<scope>`). The provider writes `data-theme` on `<html>`.
- The theme change uses a View Transition with a clip-path circle from the toggle. It changes at once when View Transitions are missing or motion is reduced.
- The spec gives only background, text and accent for Paper, Night and Sepia. Muted, surface and rule colors for those themes are derived and checked with axe for WCAG AA contrast.
- Storage access never throws. Blocked storage falls back to defaults.
- CSP: `style-src` allows `'unsafe-inline'` because motion libraries and React set inline styles. `script-src` stays `'self'`. Vite must never inline fonts as `data:` URIs (`assetsInlineLimit`), because `font-src` is `'self'`.

## Consequences

- A writer who turns on Calm on the landing page also has Calm in the app (one key).
- New effects must read `reduced`; reviewers check this.
