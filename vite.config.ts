/// <reference types="vitest/config" />
import { fileURLToPath, URL } from "node:url";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig, loadEnv } from "vite";
import { cspMeta, moduleMap } from "./scripts/vite-plugins.ts";

/** The Supabase origin joins connect-src only when the build has one (spec section 15.1). */
function supabaseOrigin(url: string | undefined): string[] {
  if (!url) return [];
  const { protocol, host } = new URL(url);
  if (protocol !== "https:") throw new Error("VITE_SUPABASE_URL must use https");
  return [`https://${host}`];
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "VITE_");
  return {
    plugins: [
      react(),
      tailwindcss(),
      cspMeta({ connectSrc: supabaseOrigin(env.VITE_SUPABASE_URL) }),
      moduleMap(),
    ],
    resolve: {
      alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
    },
    build: {
      target: "es2022",
      sourcemap: false,
      // Fonts must load from 'self' under the CSP (font-src 'self'), so never inline them as data: URIs.
      assetsInlineLimit: (file) => (/\.(woff2?|ttf|otf)$/.test(file) ? false : undefined),
    },
    test: {
      globals: true,
      environment: "jsdom",
      setupFiles: ["./src/test/setup.ts"],
      include: ["src/**/*.test.{ts,tsx}", "scripts/**/*.test.ts"],
      css: false,
    },
  };
});
