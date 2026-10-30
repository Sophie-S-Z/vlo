import type { RouteObject } from "react-router";
import { LandingPage } from "@/landing/LandingPage";
import { AppLayout, LandingLayout } from "@/ui/layouts";

const lazyPage = (load: () => Promise<{ default: React.ComponentType }>) => async () => ({
  Component: (await load()).default,
});

export function createRoutes({ appEnabled }: { appEnabled: boolean }): RouteObject[] {
  const notFound: RouteObject = {
    path: "*",
    lazy: lazyPage(() => import("@/ui/pages/NotFoundPage")),
  };
  return [
    {
      Component: LandingLayout,
      children: [
        { index: true, element: <LandingPage appEnabled={appEnabled} /> },
        { path: "privacy", lazy: lazyPage(() => import("@/ui/pages/PrivacyPage")) },
        { path: "ai-policy", lazy: lazyPage(() => import("@/ui/pages/AiPolicyPage")) },
        notFound,
      ],
    },
    {
      Component: AppLayout,
      children: [
        { path: "share/:id", lazy: lazyPage(() => import("@/share/ShareRoute")) },
        ...(appEnabled ? [{ path: "app/*", lazy: lazyPage(() => import("@/app/AppShell")) }] : []),
      ],
    },
  ];
}
