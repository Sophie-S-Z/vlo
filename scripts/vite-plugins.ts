import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import type { Plugin } from "vite";
import { buildCsp } from "./csp.ts";

/** Adds the CSP meta tag to index.html in production builds only. The dev server needs inline scripts. */
export function cspMeta(): Plugin {
  return {
    name: "vlo-csp-meta",
    apply: "build",
    transformIndexHtml: {
      order: "post",
      // Insert right after the charset tag: the charset must stay in the first 1024 bytes,
      // and the policy must come before every script.
      handler: (html) => {
        const charset = /<meta charset="UTF-8" \/>/;
        if (!charset.test(html)) throw new Error("vlo-csp-meta: charset meta tag not found");
        const meta = `<meta http-equiv="Content-Security-Policy" content="${buildCsp()}" />`;
        return html.replace(charset, (tag) => `${tag}\n    ${meta}`);
      },
    },
  };
}

export interface ChunkInfo {
  isEntry: boolean;
  imports: string[];
  dynamicImports: string[];
  modules: string[];
}

export const MODULE_MAP_PATH = "build-meta/modules.json";

/** Writes build-meta/modules.json (outside dist, so it never deploys) so scripts/check-bundle.mjs can see which source modules sit in the initial bundle. */
export function moduleMap(): Plugin {
  let ssr = false;
  return {
    name: "vlo-module-map",
    apply: "build",
    configResolved(config) {
      ssr = Boolean(config.build.ssr);
    },
    generateBundle(_options, bundle) {
      if (ssr) return;
      const map: Record<string, ChunkInfo> = {};
      for (const [fileName, output] of Object.entries(bundle)) {
        if (output.type !== "chunk") continue;
        map[fileName] = {
          isEntry: output.isEntry,
          imports: output.imports,
          dynamicImports: output.dynamicImports,
          modules: Object.keys(output.modules),
        };
      }
      const out = resolve(process.cwd(), MODULE_MAP_PATH);
      mkdirSync(dirname(out), { recursive: true });
      writeFileSync(out, JSON.stringify(map, null, 2));
    },
  };
}
