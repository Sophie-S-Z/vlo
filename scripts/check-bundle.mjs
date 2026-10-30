// Guardrail 5 and the initial-JS budget (spec section 21).
// Reads build-meta/modules.json (written by the vlo-module-map Vite plugin) and fails the build when
// the initial bundle holds 3D, physics, dev-tool or AI code, or exceeds the gzip budget.
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { gzipSync } from "node:zlib";

/** @type {RegExp[]} */
export const FORBIDDEN_IN_INITIAL = [
  /\/node_modules\/three\//,
  /\/node_modules\/matter-js\//,
  /\/node_modules\/tweakpane\//,
  /\/node_modules\/@mlc-ai\/web-llm\//,
  /\/src\/ai\//,
  /\/node_modules\/gsap\//,
  /\/node_modules\/@gsap\//,
  /\/node_modules\/lenis\//,
  /\/node_modules\/motion\//,
  /\/node_modules\/framer-motion\//,
  /\/src\/landing\/effects\//,
];

/** Writing-app code that must not ship at all while VITE_APP_ENABLED is off (spec section 7). */
export const HIDDEN_APP_MODULES = [/\/src\/app\/(?!flags\.ts$)/];

/**
 * @param {{ dist: string; moduleMap: string; maxGzipKb: number; forbidden?: RegExp[]; forbiddenAnywhere?: RegExp[] }} options
 * @returns {{ ok: boolean; initialFiles: string[]; initialGzipKb: number; violations: string[] }}
 */
export function checkBundle({
  dist,
  moduleMap,
  maxGzipKb,
  forbidden = FORBIDDEN_IN_INITIAL,
  forbiddenAnywhere = [],
}) {
  /** @type {Record<string, { isEntry: boolean; imports: string[]; modules: string[] }>} */
  const chunks = JSON.parse(readFileSync(moduleMap, "utf8"));

  const initial = new Set();
  const queue = Object.keys(chunks).filter((file) => chunks[file]?.isEntry);
  while (queue.length > 0) {
    const file = /** @type {string} */ (queue.shift());
    if (initial.has(file)) continue;
    initial.add(file);
    queue.push(...(chunks[file]?.imports ?? []));
  }

  const violations = [];
  if (initial.size === 0) {
    violations.push("no entry chunk found in the module map; the guardrail cannot run");
  }
  for (const [file, info] of Object.entries(chunks)) {
    for (const moduleId of info.modules) {
      if (forbiddenAnywhere.some((pattern) => pattern.test(moduleId))) {
        violations.push(`${moduleId} ships in ${file} but must not be built`);
      }
    }
  }
  let gzipBytes = 0;
  for (const file of initial) {
    gzipBytes += gzipSync(readFileSync(join(dist, file))).length;
    for (const moduleId of chunks[file]?.modules ?? []) {
      if (forbidden.some((pattern) => pattern.test(moduleId))) {
        violations.push(`${moduleId} is in initial chunk ${file}`);
      }
    }
  }

  const initialGzipKb = Math.round((gzipBytes / 1024) * 10) / 10;
  if (initialGzipKb > maxGzipKb) {
    violations.push(`initial JS is ${initialGzipKb} KB gzipped, over the ${maxGzipKb} KB budget`);
  }
  return {
    ok: violations.length === 0,
    initialFiles: [...initial].sort(),
    initialGzipKb,
    violations,
  };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const result = checkBundle({
    dist: resolve("dist"),
    moduleMap: resolve("build-meta/modules.json"),
    maxGzipKb: 250,
    forbiddenAnywhere: process.env.VITE_APP_ENABLED === "true" ? [] : HIDDEN_APP_MODULES,
  });
  console.log(
    `Initial JS: ${result.initialGzipKb} KB gzipped in ${result.initialFiles.length} file(s).`,
  );
  for (const violation of result.violations) console.error(`FAIL: ${violation}`);
  if (!result.ok) process.exit(1);
  console.log("Bundle guardrail passed.");
}
