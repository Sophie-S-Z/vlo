// Build-time prerender of the landing page (scripts/prerender.mjs), so the headline is in the HTML
// and paints before any JavaScript runs (spec section 18.4: LCP is the HTML headline).
import { StrictMode } from "react";
import { renderToString } from "react-dom/server";
import { createStaticHandler, createStaticRouter, StaticRouterProvider } from "react-router";
import { loadApp } from "@/appLoader";
import { MotionPreferencesProvider } from "@/motion/MotionPreferences";
import { createRoutes } from "@/router";

export async function render(path: string): Promise<string> {
  const handler = createStaticHandler(createRoutes({ loadApp }));
  const context = await handler.query(new Request(new URL(path, "http://localhost")));
  if (context instanceof Response) throw new Error(`prerender: ${path} returned a redirect`);
  const router = createStaticRouter(handler.dataRoutes, context);
  return renderToString(
    <StrictMode>
      <MotionPreferencesProvider>
        {/* hydrate={false}: no inline hydration script, which the CSP would block. */}
        <StaticRouterProvider router={router} context={context} hydrate={false} />
      </MotionPreferencesProvider>
    </StrictMode>,
  );
}
