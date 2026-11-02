/** Initial JavaScript budget, gzip, without lazy chunks (spec section 12). */
export const BUDGET_BYTES = 250_000;

/**
 * Lists the JavaScript files that load before first render: the entry and every static import,
 * followed through the Vite manifest. Dynamic imports (lazy chunks) are left out.
 */
export function initialChunks(manifest, entry) {
  if (!(entry in manifest)) throw new Error(`Entry ${entry} is not in the Vite manifest.`);
  const seen = new Set();
  const files = [];
  const stack = [entry];
  while (stack.length > 0) {
    const key = stack.pop();
    if (seen.has(key)) continue;
    seen.add(key);
    const chunk = manifest[key];
    if (!chunk) continue;
    if (chunk.file.endsWith('.js')) files.push(chunk.file);
    for (const next of chunk.imports ?? []) stack.push(next);
  }
  return files;
}
