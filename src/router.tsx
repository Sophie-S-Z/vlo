import type { RouteObject } from "react-router";
import { LandingPage } from "@/landing/LandingPage";
import { AppScope, LandingScope, PageShell } from "@/ui/layouts";

type PageModule = { default: React.ComponentType };

const lazyPage = (load: () => Promise<PageModule>) => async () => ({
  Component: (await load()).default,
});

export interface RouteOptions {
  /** Loads the writing app. Null hides /app and the landing link (VITE_APP_ENABLED off). */
  loadApp: (() => Promise<PageModule>) | null;
}

export function createRoutes({ loadApp }: RouteOptions): RouteObject[] {
  const appEnabled = loadApp !== null;
  const notFound: RouteObject = {
    path: "*",
    lazy: lazyPage(() => import("@/ui/pages/NotFoundPage")),
  };
  return [
    {
      Component: LandingScope,
      children: [
        { index: true, element: <LandingPage appEnabled={appEnabled} /> },
        {
          Component: PageShell,
          children: [
            { path: "privacy", lazy: lazyPage(() => import("@/ui/pages/PrivacyPage")) },
            { path: "ai-policy", lazy: lazyPage(() => import("@/ui/pages/AiPolicyPage")) },
            notFound,
          ],
        },
      ],
    },
    {
      Component: AppScope,
      children: [
        {
          Component: PageShell,
          children: [
            { path: "share/:id", lazy: lazyPage(() => import("@/share/ShareRoute")) },
            ...(loadApp ? [{ path: "app/*", lazy: lazyPage(loadApp) }] : []),
          ],
        },
      ],
    },
  ];
}
