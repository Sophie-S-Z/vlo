import { createBrowserRouter, RouterProvider } from "react-router";
import { loadApp } from "@/appLoader";
import { MotionPreferencesProvider } from "@/motion/MotionPreferences";
import { createRoutes } from "@/router";

const router = createBrowserRouter(createRoutes({ loadApp }));

export function App() {
  return (
    <MotionPreferencesProvider>
      <RouterProvider router={router} />
    </MotionPreferencesProvider>
  );
}
