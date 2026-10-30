import { createBrowserRouter, RouterProvider } from "react-router";
import { APP_ENABLED } from "@/app/flags";
import { MotionPreferencesProvider } from "@/motion/MotionPreferences";
import { createRoutes } from "@/router";

const router = createBrowserRouter(createRoutes({ appEnabled: APP_ENABLED }));

export function App() {
  return (
    <MotionPreferencesProvider>
      <RouterProvider router={router} />
    </MotionPreferencesProvider>
  );
}
