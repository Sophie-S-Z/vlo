/*
 * The network module (VLO_SPEC section 10): the only code that may call fetch. For now it reads files
 * that the app itself serves, such as the fonts that a PDF or EPUB export embeds. Such a request stays on
 * the app's own origin, so it is not an outgoing request (US09). vloFetch and the network log arrive with
 * F25.
 */

/** Reads a file under public/, such as "fonts/lora/regular.ttf", from the app's own origin. */
export async function appFile(path: string): Promise<Uint8Array> {
  const origin = globalThis.location.origin;
  const url = new URL(`${import.meta.env.BASE_URL}${path}`, origin);
  if (url.origin !== origin) throw new Error(`${path} is not a file of this app.`);
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Vlo could not load ${path} (HTTP ${String(response.status)}).`);
  return new Uint8Array(await response.arrayBuffer());
}
