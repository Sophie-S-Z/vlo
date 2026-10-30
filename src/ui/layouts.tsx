import { Link, Outlet } from "react-router";
import { SiteControls } from "@/ui/SiteControls";
import { ThemeProvider, type ThemeScope } from "@/ui/theme/ThemeProvider";

function Shell({ scope }: { scope: ThemeScope }) {
  return (
    <ThemeProvider scope={scope}>
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-card focus:bg-surface focus:px-3 focus:py-2"
      >
        Skip to content
      </a>
      <header className="flex items-center justify-between gap-2 border-b border-rule px-4 py-2">
        <Link to="/" className="font-display text-2xl leading-none font-semibold">
          Vlo
        </Link>
        <SiteControls />
      </header>
      <main id="main" tabIndex={-1} className="mx-auto w-full max-w-3xl px-4 py-12 outline-none">
        <Outlet />
      </main>
    </ThemeProvider>
  );
}

export const LandingLayout = () => <Shell scope="landing" />;
export const AppLayout = () => <Shell scope="app" />;
