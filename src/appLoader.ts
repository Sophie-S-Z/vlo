// Compare inline so the build drops the app chunk entirely when the flag is off (ADR 0003).
// The client and the prerender both read this, so their markup matches.
export const loadApp =
  import.meta.env.VITE_APP_ENABLED === "true" ? () => import("@/app/AppShell") : null;
