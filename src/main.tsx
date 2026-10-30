import { StrictMode } from "react";
import { createRoot, hydrateRoot } from "react-dom/client";
import "@/index.css";
import { App } from "@/App";

const root = document.getElementById("root")!;
const app = (
  <StrictMode>
    <App />
  </StrictMode>
);

// index.html holds the prerendered landing page. Hydrate it on "/"; elsewhere render fresh.
if (window.location.pathname === "/" && root.hasChildNodes()) {
  hydrateRoot(root, app);
} else {
  root.replaceChildren();
  createRoot(root).render(app);
}

// Load web fonts after the first paint, so the prerendered headline paints with the fallback font
// and never waits on font files (spec 18.4 LCP budget). The swap happens once fonts arrive.
requestAnimationFrame(() => {
  void import("@/ui/fonts");
});
