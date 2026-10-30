import { createBrowserRouter, RouterProvider } from "react-router";
import { MotionPreferencesProvider } from "@/motion/MotionPreferences";
import { createRoutes } from "@/router";

// Compare inline so the build drops the app chunk entirely when the flag is off (ADR 0003).
const loadApp = import.meta.env.VITE_APP_ENABLED === "true" ? () => import("@/app/AppShell") : null;

const router = createBrowserRouter(createRoutes({ loadApp }));

export function App() {
  return (
    <MotionPreferencesProvider>
      <RouterProvider router={router} />
    </MotionPreferencesProvider>
  );
}
